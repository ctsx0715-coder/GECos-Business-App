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
pnpm test                   # 528 tests against a real database
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

### Month view

The roster answers a foreman's question — who is on site next week. **Work
cycles → Month view** answers the one the person themselves asks, which the
system could not answer at all without opening four screens: what am I
working, when am I off, and which of those days are already spoken for.

A calendar rather than a list, because the shape of the month *is* the answer:
fourteen nights and then a blank week reads at a glance and has to be
reconstructed line by line from a table. Each day carries its shift, its site
placement, its public holiday or its leave.

Every day is resolved from the turn in force **on that day**, not from the
pattern the employee record currently points at. A month with a rotation
change in the middle of it is the reason the turns are stored: on the 14th
they were on days and on the 15th they are on nights, and a calendar that
flattens that is wrong for half the month.

Leave shows only on days they would have worked. A request spanning a Sunday
covers the Sunday and cost nothing, so colouring it as leave would contradict
the day count — the same rule the leave arithmetic has always used, applied to
the calendar so the two agree. "Days due in" is the pattern less holidays and
less leave: the days somebody actually expects them.

Your own month needs no permission, on the same reasoning as your own leave
balance. Anybody else's goes through the same check as their record.

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

### Timesheets

Everything else in Work cycles is a plan: the pattern says which days, the
shift says which hours, the roster says where. **Work cycles → Timesheets** is
the only record of what actually happened, and it is a separate table for
exactly that reason — reconciling the two is the point, and a plan that
overwrites itself with reality can no longer be compared to it.

Time is stored as the two moments, never as a number of hours. "When did you
leave" is the question in dispute when a payslip is queried, and a total cannot
answer it; the total is derived on every read, so there is no second figure to
disagree with the times beside it.

A night shift belongs to the day it **started**. Clocking in at 18:00 on
Tuesday and out at 06:00 on Wednesday is Tuesday's work, and paying it against
Wednesday puts half a construction payroll in the wrong week.

The shift and the site are copied onto the entry at the moment of clocking in
rather than read back later, so rewriting next week's roster cannot change what
somebody's Tuesday was measured against. The variance — over or under the shift
that was planned — falls out of that comparison. A pattern with no shift has no
expected length, so nothing is claimed about it rather than eight hours being
invented.

Four permissions, because four different people hold them:

| Permission | Who |
|---|---|
| `hr.timesheet.record` | Everybody, for themselves |
| `hr.timesheet.manage` | Clocks anybody in, and corrects entries — a site clerk does this for a crew with no logins |
| `hr.timesheet.view` | Reads the whole company's week |
| `hr.timesheet.approve` | Signs it off for payroll |

Approving is deliberately not the same permission as recording: signing off
what you yourself typed is how a timesheet becomes a payment nobody checked.
An entry that is still running cannot be signed — nobody knows yet how long it
was — and an entry that *has* been signed is not edited, because payroll has
been run against it. Withdrawing the approval first is a deliberate act and
leaves both facts in the audit trail.

An entry left running longer than anybody works is flagged rather than
truncated. The system does not know what happened, and quietly rewriting
somebody's hours to a number that suits it is worse than asking.

### Coverage

The roster says who is placed and the leave register says who is away. Neither
knew how many people were *supposed* to be there, so the one question worth
asking on a Friday afternoon — are we short next week — could not be asked at
all. **Work cycles → Coverage** supplies the missing number and does the
subtraction.

A staffing rule says how many people a thing needs, and every narrowing on it
is optional: a site, a department, a shift, particular weekdays. That one shape
covers "the whole company needs somebody on a Sunday", "the workshop needs a
boilermaker Monday to Friday" and "the water works needs three to five on the
day shift, six days a week". It is a row rather than a constant because the
number is a judgement that changes weekly, and the person who knows it is a
site manager rather than whoever deploys.

Somebody counts towards a rule on a day when their pattern has them working
it, the company is not closed, their leave has not been approved, and the
narrowing matches. Leave that is only *requested* does not remove them — it has
not been granted — but the cell says what approving it would cost, which is
exactly what the person holding the request needs to know.

Short and over are not shown alike. Being short means work does not happen;
being over means it cost more than it needed to. A rule with no ceiling can
never be overstaffed, because too many hands is a cost rather than a failure.
A week is judged by its worst day rather than by an average — five comfortable
days do not staff the Wednesday nobody turned up for.

A public holiday reads as **closed**, not short. Nobody is due in, so every
rule would show zero against its minimum and the week would be a wall of red
for a day that went exactly as intended. A site that must be manned through a
holiday is a different arrangement, and this model does not express it yet.

Deliberately not a shift-by-shift schedule — every day of every week planned
individually is a much larger thing, and most of what it buys is already here:
the pattern says who is due in, the roster says where, and a rule says how many
are wanted.

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

A rung addressed to a role is now enforced as one. Until leave went through the
engine only a named user was checked, so any holder of the domain permission
could sign off a step addressed to the Finance Manager — which makes "not
everybody can approve this" a claim the software did not keep. Somebody senior
who disagrees with a chain can change the chain, which is what the screen is
for and leaves a record.

### Leave, through the chain

Leave used to be decided by anybody holding `hr.leave.approve`. It now runs on
the same engine as everything else, triggered by `leave.requested`, and the
demo chain is the arrangement most small contractors actually use: **their
manager always, and HR as well once the absence reaches five days.** A day off
does not need two signatures.

Three things follow, and each is a test:

- One approver on a two-rung chain settles nothing. The request stays
  submitted until the last rung signs, which is the difference between a
  hierarchy and a queue of people who can each end it.
- A rejection anywhere ends it and hands the days back.
- **The manager** means the *employee's* manager, read off the employee record
  rather than off whoever typed the request in. Most of a construction payroll
  has no login and their leave is filed by HR — resolving it from the acting
  user would send a boilermaker's leave to the HR manager's manager.

With no chain configured, nothing starts and leave is decided exactly as it was
before. That is not a fallback nobody meant: for a company of fifteen people,
one approver is the right answer, and the ladder should not appear until
somebody asks for it.

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
