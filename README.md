# Nopedi Business Operating System

A centralised platform for managing people, customers, projects, tenders,
procurement, assets, compliance and financial operations from one system.

Past the walking skeleton. Tenders, CRM, Projects and HR are built, with
record-level reporting and a design system across all of them. Five Stage 1
acceptance criteria remain open, every one blocked on an external account
rather than a decision — see [`docs/01-demo-scope.md`](docs/01-demo-scope.md).

## Documentation

| Document | What it covers |
|---|---|
| [`docs/00-architecture-decisions.md`](docs/00-architecture-decisions.md) | Decisions that are expensive to reverse, and why |
| [`docs/01-demo-scope.md`](docs/01-demo-scope.md) | Skeleton scope, security staging, acceptance criteria |
| [`docs/02-discovery-questions.md`](docs/02-discovery-questions.md) | What we still need from the client, ordered by cost of getting it wrong |
| [`docs/03-tender-lifecycle-preview.md`](docs/03-tender-lifecycle-preview.md) | The full tender lifecycle, what is built, and the walkable preview of what is not |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind · Prisma 7 · PostgreSQL ·
Zod · Vitest. Clerk, Vercel Blob and Resend are planned but not yet wired in.

## Getting started

Requires Node 20.9+ and a PostgreSQL 14+ database.

```bash
pnpm install
cp .env.example .env        # then point DATABASE_URL at your database
pnpm prisma migrate dev     # create the schema
pnpm test                   # 269 tests against a real database
```

`pnpm install` runs `prisma generate` automatically. The generated client lands
in `src/generated/prisma` and is not committed.

### Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm test` | Full test suite (needs a database) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | Create and apply a migration |
| `pnpm db:sync` | Reconcile permissions, roles and module flags into an existing database |
| `pnpm db:seed` | Build a demo dataset from nothing — **truncates every table first** |
| `pnpm hr:backfill` | Add the HR demo dataset to a database that already has data — additive, idempotent |
| `pnpm hr:accrue` | Credit leave balances with what they have earned. Runs monthly from Actions |
| `pnpm db:studio` | Browse the database |
| `pnpm screenshots:lifecycle` | Drives the lifecycle preview and reporting screens, asserting on each |

`db:sync` runs automatically on every **production** deploy and is safe to
repeat: it only adds, leaves an unimplemented module switched off, and never
creates users. It is what makes a new module visible on a database that already
exists — without it, the permission rows, role links and the module flag a new
module needs are only ever written when a tenant is first created, and the
module is invisible to everyone, including a user holding every permission.

Switching an implemented module **on** is part of that. A tenant seeded before
a module shipped already has a row for it saying off, so creating only the
missing rows would leave the module hidden forever. Nothing can switch a module
off today — there is no interface for it — so `false` on an implemented module
means only "written before the module existed". The day a toggle is built, the
tenant's choice has to be recorded on the row and `db:sync` taught to respect
it.

Preview deployments skip both migrations and the sync. They share the
production database, so writing to it from a preview would change the schema
production is serving from — and when the same commit sits on two branches,
both builds race for Prisma's advisory lock and one fails. Schema belongs to
the production deploy. If previews ever get a database of their own, set
`NOPEDI_MIGRATE_ON_PREVIEW=true` in the preview environment.

## Leave

Entitlement is a ledger: a row per person, per leave type, per cycle, holding
what they were granted, what they carried in and what they have taken. Nothing
about that changed when accrual arrived — accrual is one more thing that
credits the ledger, and the rules that spend against it never had to know.

Each leave type says how it is credited:

| Method | What it does |
|---|---|
| Set by hand | Nothing accrues. HR writes the entitlement |
| Granted at the start of the cycle | The full entitlement on day one, or on a joiner's first day. Not pro-rated |
| Accrues each completed month | A fixed number of days per calendar month worked in full. 1.25 reaches the BCEA's 15-day minimum, and a joiner pro-rates themselves |

`pnpm hr:accrue` runs on the first of every month from GitHub Actions, and the
leave policy screen has a button that calls the same service. Both are safe to
repeat: every balance records the date it has been credited to, so a second run
the same day credits nothing and a run missed for a quarter catches up all
three months. The arithmetic is in `src/modules/hr/leave-accrual.ts`, with no
database in it, and `leave-accrual.test.ts` drives it across a year.

A cycle is the calendar year. An organisation whose leave year runs March to
February is a policy answer we do not have yet, and it changes one function.

## Architecture in one page

Every request flows in one direction, and each layer has one job:

```
Route handler / server action
  → Zod validation
    → Service          business rules, permission checks
      → Repository     tenant-scoped Prisma access
        → Database
```

No Prisma calls in components or route handlers. No business logic in
repositories. Permission checks live in services, because that is the single
layer every path goes through.

### The three things to understand first

**Tenancy.** Every table carries `organisationId`. A Prisma client extension
(`src/lib/database/extensions.ts`) injects it into reads and writes from an
AsyncLocalStorage request context, so no caller has to remember. Queries with
no context bound throw rather than returning everything.

**One employee is not one user.** A user can sign in; an employee is on the
payroll. Most site staff are the latter only. Keeping them as separate records
is why nobody has to invent a login for a boilermaker who will never use the
system.

**Nothing is hard deleted.** `delete` is rewritten as an update setting
`deletedAt`, and reads filter it out. The row and its history survive.

**Audit is automatic.** The same extension writes `audit_logs` rows with
before/after diffs on every create, update and delete. It cannot be forgotten
in a module written later, because no module opts into it.

Model behaviour is declared in `src/lib/database/model-metadata.ts`, and
`model-metadata.test.ts` parses the schema and fails if a model is added
without being registered. That test is the reason the guarantees above hold as
the system grows.

## Security posture

Deliberately staged — the reasoning is retrofit cost, not risk appetite, and it
is set out in [`docs/01-demo-scope.md`](docs/01-demo-scope.md).

Structural work that is expensive to add later is already in: the tenant
column, the local users table, the extension, server-side permission checks.

Configuration and middleware that costs the same later as now is deferred: MFA,
password policy, lockout, SSO, rate limiting, secure headers, and Postgres
row-level security.

> **Hard gate.** RLS and MFA must be enabled before real client data enters the
> system, and before a second tenant exists in production. Seeded demo data is
> fine without them. Live data is not.
