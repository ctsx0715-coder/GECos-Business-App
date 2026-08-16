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
pnpm test                   # 438 tests against a real database
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
| `pnpm hr:rotate` | Move people onto turns that start today. Runs every morning from Actions |
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

The same run carries unused days across the year boundary, up to each type's
carry-over limit. It is part of the accrual run rather than a January job of
its own, because a job that only fires on 1 January costs somebody their leave
the first time GitHub skips it — and the figure is recomputed from the closing
cycle rather than accumulated, so running it in March lands on the same answer.

`pnpm hr:accrue` runs on the first of every month from GitHub Actions, and the
leave policy screen has a button that calls the same service. Both are safe to
repeat: every balance records the date it has been credited to, so a second run
the same day credits nothing and a run missed for a quarter catches up all
three months. The arithmetic is in `src/modules/hr/leave-accrual.ts`, with no
database in it, and `leave-accrual.test.ts` drives it across a year.

Not yet handled: the BCEA's rule that carried days expire six months into the
new cycle. That needs a date the ledger does not record, so it is left undone
rather than half-done.

### Shifts

A shift is a stretch of the day — days, nights, the Saturday half-day — kept
apart from patterns on purpose. A pattern says *which days*; a shift says
*which hours*. The same six-day pattern is worked on days by one crew and
nights by another, and one table each keeps that from becoming a list of
"six-day days", "six-day nights", "six-day afternoons".

Times are minutes from midnight, because a shift is a time of day rather than
a moment: 18:00 to 06:00 is an ordinary night shift that ends the following
morning, which no pair of timestamps can express without a date attached. They
live on **Work cycles → Shifts**, and attach to a work pattern.

### Work patterns

Which days somebody works decides what a week of leave costs them. Monday to
Friday was assumed everywhere until patterns existed, and on a construction
payroll that is wrong more often than it is right: sites commonly work six
days, and plant operators work rotations.

A pattern is a repeating cycle — `cycleDays` long, with the positions in it
that are worked — so a fortnightly rotation is the same shape as an ordinary
week rather than a special case. Each person can have one; anyone without falls
back to the tenant's default, and a tenant with no default falls back to Monday
to Friday, which is exactly where the system was before. They live on
**Work cycles → Work patterns**.

Not yet handled: entitlement is not scaled by pattern. The BCEA's 21 consecutive
days is 15 working days on a five-day week and 18 on a six-day week, and which
applies to Nopedi is the same open policy question as the rest of the leave
rules — so entitlement stays rows somebody writes.

### Rotation

Assigning a pattern one person at a time is fine until a foreman moves a crew
of eighteen onto nights for a month. That is one decision about a group, so
**Work cycles → Rotation** takes it as one: tick the people, choose the pattern
and the shift, say when it starts and how long it runs.

The shift is chosen here rather than only on the pattern, which is what the two
tables were always for — the same six-day pattern worked on days by one crew
and nights by another. A person's own shift wins; without one they work the
hours their pattern carries.

Each assignment is a *turn*, stored as a date range. The employee record keeps
the current pattern and shift because every screen and every leave calculation
asks that question, and `pattern_assignments` is the history behind it: since
when, what came before, and what is written for next month. A turn dated ahead
takes effect on the day — `pnpm hr:rotate` runs every morning from Actions, and
anything it missed shows on the screen with a button, so a skipped run is
visible rather than a roster that is quietly wrong. A turn that ends with
nothing after it leaves the person where they are; the end date is a plan, not
a revocation.

**The fairness watch** is why the history exists. On a construction payroll the
unpopular turns are real — nights, the six-day week, the fortnight away — and
left to a spreadsheet they land on whoever is easiest to ask. Each pattern says
how many turns in a row is too many, and the system counts. The office week
sets no limit, because nobody is hard done by a fourth Monday-to-Friday month
and a warning that fires on everybody is one nobody reads.

It warns. It never refuses, and that is a decision rather than an omission: a
rule that blocks a foreman staffing tonight's shift does not produce fairness,
it produces a foreman who stops recording who is on nights — and a system that
is wrong about that cannot tell anybody they have had too many. The warning
appears before the assignment, again after it, and stands on the screen until
somebody else takes the next turn.

Who works what is visible to everyone who can read the roster, on the same
reasoning: the crew is not the last to know where the crew is. How often one
person has drawn nights is not — it is a prompt aimed at whoever assigns the
work, so it needs `hr.roster.manage`.

### Roster

Who is on which site, a week at a time, at **Work cycles → Roster**. Placements are
date ranges rather than a row per day, because a fortnight on one site is one
decision — the days inside it come from the person's work pattern, so a
six-day week shows its Saturday and a rotation shows nothing in its off week.

Every cell is one of four things and they are meant to be told apart without
reading: placed, on leave, due in but unplaced, and not a working day at all.
That last one is the reason the roster knows about patterns and holidays: a day
somebody was never going to work must not look like a day nobody has got round
to filling.

Two clashes are refused — being in two places at once, and being placed across
approved leave. Leave that is only requested is shown rather than refused,
because the roster is often what decides whether that request gets approved.

### Public holidays

Leave is never charged for a day the company is closed. The twelve statutory
holidays are generated per year — including Good Friday and Family Day, which
move with Easter, and the Public Holidays Act's rule that a holiday falling on
a Sunday is taken on the Monday — and anything the calculation cannot know is a
row: a builders' shutdown, an election day proclaimed six weeks out. Both live
on **Work cycles → Public holidays**, and the generator never overwrites a day
somebody added by hand.

The leave form counts with the same function and the same days as the service,
so the number on the screen before submitting is the number that is charged.

A cycle is the calendar year. An organisation whose leave year runs March to
February is a policy answer we do not have yet, and it changes one function.

## Approvals

Who may approve what is a chain, not a permission. The permission says a person
*can* approve; the chain says *which* approvals reach them, in what order, and
what has to happen before theirs counts. The engine behind it is ADR-006 —
linear ordered steps, approvers resolved by role, by the requester's manager or
by name, and conditions limited to a scalar on the triggering record.

The engine has enforced these since the tender module. What did not exist until
now was any way to write a chain down without a deployment, which meant the
answer to "not everybody can approve this" was whatever the seed happened to
say. **Support → Approval chains** is that screen.

Reading and writing are separate permissions on purpose: somebody who can
rewrite a chain can approve anything by writing themselves into it, so
`core.workflow.manage` is a strictly larger power than any single approval, and
the finance manager who wants to see where their step sits does not need it.

Two rules stop a chain that cannot work. It may not be switched on with no
steps — the engine finds nothing applicable and the record sails through, which
is worse than an obviously inactive chain. And two chains may not share a
trigger, because the engine takes the first it finds and the second would be a
rule somebody wrote and nobody applies.

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
