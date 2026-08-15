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
pnpm test                   # 234 tests against a real database
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
| `pnpm db:studio` | Browse the database |
| `pnpm screenshots:lifecycle` | Drives the lifecycle preview and reporting screens, asserting on each |

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
