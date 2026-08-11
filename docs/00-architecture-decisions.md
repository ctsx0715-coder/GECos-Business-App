# Architecture Decisions

Nopedi Business Operating System. Decisions recorded here are the ones that are
expensive to reverse. Everything not listed is a normal implementation choice and
can change freely.

Status: agreed 11 Aug 2026.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Server actions for mutations, route handlers for anything external |
| UI | Tailwind + shadcn/ui | Copy-in components, no runtime dependency to fight later |
| Forms | React Hook Form + Zod | One schema per entity, shared between client validation and server |
| Tables | TanStack Table | Server-side pagination from day one, not client-side |
| ORM | Prisma | CRUD only. Reporting uses raw SQL (see ADR-005) |
| Database | Neon Postgres | Connection pooling via Neon's pooler |
| Auth | Clerk | Organizations, MFA, SSO, lockout out of the box |
| File storage | Vercel Blob | Presigned client uploads (see ADR-003) |
| Hosting | Vercel | Function region co-located with Neon region |
| Jobs | Vercel Cron | Nightly expiry sweep, SLA escalation, digest emails |
| Email | Resend | Transactional + notification digests |
| Errors | Sentry | From the first deploy, not retrofitted |

### Why Clerk over Auth.js

MFA, password policy, account lockout, session management and SSO are all
explicit requirements. Building those on Auth.js is roughly a week of Phase 1,
and it is a week spent on a solved problem with real security downside if done
badly. Clerk's Organizations primitive also maps directly onto our tenancy model.

The tradeoff accepted: user identity lives with a vendor, and per-user cost
scales. Mitigation is ADR-002 — Clerk owns authentication only. It does not own
authorisation, and it does not own the user record.

### Region and data residency

Neon does not currently offer an African region — verify at project creation.
Assume `aws-eu-central-1` (Frankfurt).

**Vercel functions must be pinned to the same region as the database.** If the
database is in Frankfurt, functions go to `fra1`, not `cpt1`. A page that runs
six queries from Cape Town against a Frankfurt database costs six ~160ms round
trips if the function is local, and one if the function sits next to the
database. Co-location is not optional.

POPIA does not require in-country storage. Section 72 permits cross-border
transfer where the recipient is subject to a law providing substantially similar
protection — an EU/GDPR jurisdiction satisfies this comfortably. Confirm with
Nopedi whether any contract or public-sector tender they bid on imposes a
stricter residency term than the statute does; some organs of state do.

---

## ADR-001 — Multi-tenant, column now, RLS before real data

Every table carries `organisation_id`. This is not negotiable and not deferrable:
it is the shape of the data, not a security feature. Adding a tenant column to
forty populated tables later means a migration and backfill per table plus a
rewrite of every existing query.

Tenant enforcement happens in two layers, deliberately staged:

**Stage 1 — repository layer.** The Prisma extension (ADR-007) injects
`organisation_id` into every query. A test asserts that a second organisation's
records are invisible when querying with the wrong tenant context.

**Stage 2 — Postgres RLS.** Policies enabled on every tenant table, tenant set
per request via a session variable.

RLS is the stronger guarantee, because repository enforcement is still a matter
of discipline and one forgotten path leaks another client's tender pricing. But
it is genuinely retrofittable *given the column already exists* — enabling it is
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` plus a policy per table, with no data
change and no query rewrite.

It is deferred because it adds real development friction: every query needs
session context, and a missing context returns an empty result rather than an
error, which is an expensive way to debug.

**RLS must be enabled before any real Nopedi data enters the system**, and before
a second tenant exists in production. Repository-only enforcement is acceptable
for a seeded demo. It is not acceptable for live client data.

## ADR-002 — Clerk owns authentication, we own authorisation

Clerk holds credentials, sessions, MFA and SSO. It does not hold roles or
permissions.

A local `users` table mirrors Clerk users by `clerk_user_id` and is the target of
every foreign key in the system. Roles and permissions are ours, in our database,
checked server-side on every mutation. If Clerk is ever replaced, we swap the
identity provider and keep every relationship in the schema intact.

Never write a foreign key against a Clerk ID.

## ADR-003 — Documents are a platform service, not a module

One `documents` table with `entity_type` + `entity_id`, no foreign key,
validated at the service layer against a TypeScript union of permitted entity
types. A `document_versions` child table holds the actual file references — the
document is the logical thing, versions are the physical files.

Storage keys are namespaced:

```
org/{organisationId}/{entityType}/{entityId}/{documentId}/v{n}/{filename}
```

Uploads go **direct from browser to Vercel Blob via presigned URL**. They do not
pass through a serverless function. A 50MB tender pack will exceed request body
limits and function timeouts, and it will do so on the first real day of use, not
in testing.

Access control is checked when issuing the presigned URL and when issuing the
download URL. Blob URLs are short-lived and never stored in the database — only
the key is.

## ADR-004 — One compliance/expiry engine, used everywhere

Training certificates, medical certificates, HSE compliance, tender document
validity, asset warranties, insurance policies and licences are all the same
shape: a thing with an expiry date, a computed status, and escalating
notifications.

Build `compliance_items` once, in Phase 1, as platform infrastructure with a
`category` discriminator and a polymorphic owner (same pattern as documents).

Status is **computed, never stored**:

```
NOT_COMPLETED  no certificate on record
VALID          expiry > 90 days away
EXPIRING_SOON  expiry within 90 days
EXPIRED        expiry in the past
```

A stored status field goes stale the moment nothing writes to it. The nightly job
sends notifications at 90/60/30/7 days and on expiry; it does not compute state.

## ADR-005 — Prisma for CRUD, raw SQL for reporting

Prisma's query API is good at record access and bad at analytical aggregation.
"Budget versus actual across projects with expense rollups and committed
purchase orders" is a SQL problem.

The metrics layer is a set of named, individually tested SQL queries in
`src/lib/analytics/metrics/`, each returning a typed result. Dashboard widgets
consume metrics. Widgets never query Prisma directly.

## ADR-006 — Narrow approval engine, not a workflow engine

Scoped deliberately:

- Linear ordered steps. No branching, no parallel gateways, no loops.
- Conditions are field comparisons on the triggering record only
  (`amount > 10000`, `department_id = X`). No cross-entity conditions.
- Approvers resolve by role, by the requester's manager, or by named user.
- Each step has an SLA and an escalation target.

This covers every workflow example in the brief. A general-purpose workflow
engine is where projects of this shape overrun, because the requirement is
infinite and the demos are indistinguishable. Anything beyond the above is
Phase 8 and only if a paying requirement forces it.

Tables: `workflow_definitions`, `workflow_steps`, `workflow_instances`,
`workflow_approvals`.

## ADR-007 — Nothing is hard deleted, everything is audited

Every tenant table has `deleted_at` and a `status` of `active | archived |
deleted`. A Prisma client extension filters `deleted_at IS NULL` globally and
writes audit rows on create, update and delete.

`audit_logs` records actor, action, entity type, entity id, changed fields as
before/after JSON, timestamp, IP and user agent. Written from the extension, not
from individual services, so it cannot be forgotten in a module written six
months from now.

## ADR-008 — Layering is enforced, not suggested

```
Route handler / server action
  → Zod validation
    → Service (business logic, permission checks, audit)
      → Repository (Prisma, tenant-scoped)
        → Database
```

No Prisma calls in components or route handlers. No business logic in
repositories. Permission checks live in services, because that is the single
layer every path goes through.

## ADR-009 — Modules are feature-flagged from day one

An `organisation_modules` table controls which modules a tenant sees. Navigation,
routes and permissions all respect it.

Nopedi is the first tenant, not the only one. The cost of this now is a lookup
and a nav filter. The cost of retrofitting it after 18 modules exist is a rewrite
of every route guard.

## ADR-010 — Mobile-responsive web, no native app

Field use is real (incident reporting, photo capture, attendance, task
completion), but a native app is a second codebase and a second deployment
pipeline. Build responsive-first, add a PWA manifest with offline read caching
when field use is proven, evaluate native only if offline *write* becomes a hard
requirement.

---

## Naming and conventions

- Tables snake_case plural. Prisma models PascalCase singular.
- Every table: `id` (uuid), `organisation_id`, `created_at`, `updated_at`,
  `created_by`, `updated_by`, `deleted_at`.
- Money stored as integer cents in `ZAR`. Never floats.
- All timestamps `timestamptz`, stored UTC, rendered in the org's timezone.
- Human-facing reference numbers (`TN-2026-0041`, `PO-2026-0117`) are a separate
  column from the uuid primary key, generated per organisation per year.
