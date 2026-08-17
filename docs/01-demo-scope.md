# Demo Scope — Walking Skeleton

## What this is

One vertical slice that touches every architectural layer, end to end, with real
auth and a real database. Not eighteen empty modules with a nice sidebar.

The point is to find out in week two whether the foundation holds, rather than in
week twelve. Every module built afterwards is CRUD on proven rails.

Secondary purpose, and given how little we currently know about Nopedi's actual
processes possibly the more valuable one: **this is a discovery instrument.**
Nobody describes their real approval chain accurately in a meeting. Everybody
corrects a screen that gets it wrong. Build it, show it, take notes.

## The slice

Tenders, because it is the module with the clearest value story for a South
African contractor, and because it exercises the hardest platform services —
documents, checklists, approvals, deadlines — rather than avoiding them.

```
Sign in (MFA deferred to Stage 2)
  → Organisation context resolved, tenancy enforced (RLS in Stage 2)
  → RBAC gate: Tender Officer and Director see different screens
  → Create a tender (client, tender number, closing date, value)
  → Attach documents — presigned direct upload, versioned
  → Compliance checklist auto-flags what is missing
  → Submit for approval
  → Workflow instance created, lands in Director's queue
  → Director approves
  → Notification fires: in-app + email
  → Audit trail records the whole chain
  → Dashboard widgets: "awaiting approval", "closing within 7 days"
  → Nightly cron sweeps expiry and sends warnings
```

## Security posture for the skeleton

Deliberately staged. The reasoning is retrofit cost, not risk appetite.

**Deferred to Stage 2 — config and middleware, costs the same later as now:**
MFA, password policy, account lockout, SSO, rate limiting, CSP and secure
headers, session expiry tuning, the full permission matrix, Postgres RLS
(see ADR-001).

MFA is deliberately *off* during Stage 1. It makes fifty logins a day tedious
and it makes live demos worse.

**Kept in Stage 1 — structural, expensive to retrofit:**
`organisation_id` on every table, the local `users` table mirroring Clerk, the
Prisma extension doing tenant scoping plus soft delete plus audit, and one
enforced server-side permission check to prove the pattern.

None of these are security features in the usual sense. They are the shape of
the schema and the single choke point every write passes through. Deferring them
does not remove the work, it multiplies it across eighteen modules.

**Hard gate:** RLS and MFA go on before real Nopedi data enters the system and
before a second tenant exists in production. Seeded demo data is fine without
them; live client data is not.

## Acceptance criteria

The skeleton is done when all of these are true. Ticks are backed by tests in
`tests/`, not by having clicked through it once.

Everything still unticked is blocked on external credentials (Clerk, Vercel
Blob, Resend, Sentry) rather than on design decisions.

- [x] A second seeded organisation exists, and its tenders are invisible to the
      first — verified by an automated test querying with the wrong tenant
      context, not just by clicking around
- [x] A Tender Officer cannot approve their own tender — a 403 from the service
      layer, not a hidden button. Holding `tenders.tender.approve` is not
      enough if you own or submitted the tender. The server action wraps it and
      the tests assert the error *class*, not just its wording: downgrade the
      ForbiddenError to a plain Error and the rule still holds, but the
      approver gets a crash page instead of being told why.
- [ ] A 40MB PDF uploads successfully without passing through a function
- [ ] Uploading the same document twice creates version 2, and version 1 is
      still retrievable
- [x] The checklist marks a tender non-submittable while a required document is
      missing, and the submit button is enforced server-side
- [ ] Approval fires both an in-app notification and an email
- [x] `audit_logs` contains a complete, readable chain for the tender's life
- [x] Deleting a tender sets `deleted_at` and it vanishes from lists, but the
      row and its audit history remain
- [x] Both dashboard widgets read from the metrics layer, not from Prisma
- [ ] The cron job runs on Vercel and emits a 30-day expiry warning
- [ ] Sentry captures a deliberately thrown error in production

## Explicitly not in the skeleton

Cut ruthlessly. These are Phase 2+ and adding them now defeats the purpose:

Procurement, Inventory, Assets, Finance, tender pricing
build-up, proposal document generation, configurable dashboards, report builder,
exports, SMS or WhatsApp channels, bulk import, and search.

CRM and Projects were on this list and have since been built — see "Beyond
the skeleton" below. Both were cut from the skeleton deliberately and added
only once its acceptance criteria held.

## Two stages

**Stage 1 — skeleton.** Correctness over appearance. Default styling, no custom
design work. Ends when the acceptance criteria above pass. Roughly 2–3 weeks.

**Stage 2 — polish.** Only after Stage 1 passes. Real branding, considered
empty states, loading skeletons, a seeded dataset that looks like a plausible
mid-size contractor rather than "Test Tender 1", and a rehearsed demo script.
Roughly 1 week.

Do not interleave these. Polishing a skeleton you might still tear up is the
most reliable way to waste a week.

**What actually happened, recorded because the rule above was broken.** The
design system landed while five Stage 1 criteria were still open. The
justification is that every one of them is blocked on an external account
rather than on a design decision — no amount of styling can invalidate a
document upload that has no storage behind it — so there was nothing left for
polish to waste. That reasoning is worth checking rather than reusing: it holds
because the remaining work is credentials, and it would not have held a month
earlier.

## Seed data for Stage 2

Fake but plausible. Two organisations, roughly eight users across the roles,
around twenty tenders spread across every pipeline stage, a handful genuinely
closing this week, several with deliberately missing compliance documents, two
sitting in the approval queue, and twelve months of history so the trend charts
have a shape rather than a single point.

Bad seed data is the single most common reason a working demo lands badly.

## Post-demo

Take notes on every place Nopedi says "actually, we do it differently." That
list is the real requirements document, and it is worth more than the spec we
started from.

## Beyond the skeleton

**CRM shipped after the skeleton passed**, as the next module in the phase order
(Foundation → Tenders → CRM → Projects → HR). Leads, contacts, opportunities and
a polymorphic activity timeline, with lead conversion creating the customer and
the opportunity rather than asking anyone to retype them.

It is worth recording what building it cost, because that is the return on the
foundation. No changes were needed to the tenancy extension, the audit trail,
the soft-delete rules, the permission mechanism or the reference-number
generator. Four models were added to `model-metadata.ts` — and the parity test
would have failed the build had they not been. Everything else was schema,
services, screens and tests.

**Projects followed**, completing the thread: a won tender becomes a project
carrying its customer, awarded value and a link back to the bid. Tasks,
milestones, team and costs, with a budget that counts approved spend as
committed rather than waiting for invoices to be paid — a budget that only
counts what has been paid tells a manager they are fine right up until the
invoices arrive.

Projects needed no platform changes either. Five models registered, and the
same separation-of-duties pattern the tender approvals use was reapplied to
expense approval without touching the mechanism.

**HR followed**, completing the agreed order. People, certifications and leave.
It is the sharpest test of the claim so far, because it is the first module
whose subject the code was not allowed to decide: South African leave
entitlement is the BCEA as a floor, raised by a bargaining council agreement or
company policy, and we do not know which bind Nopedi. So entitlement is rows
rather than rules, and the service only spends against a balance it was given.

Two things it did not get for free, both worth recording. Employee
certifications needed no new table — they are compliance items pointed at a
person, so the expiry sweep and warnings already existed — but the audit
extension could not serialise a Decimal, and leave is the first thing measured
in half days rather than integer cents. That is one platform change across four
modules.

**Health and safety followed HR**, and is the first module the agreed phase
order did not name — it was chosen because it follows HR most naturally (the
same people, and the certification and expiry machinery already existed) and
because it is the one a South African contractor is legally obliged to run.

It is also the first module that is not CRUD on proven rails, and it is worth
being precise about why, because the claim above deserves testing rather than
repeating. The rails held: two models registered in `model-metadata.ts`, one
service, one repository, no platform change of any kind. What it needed beyond
them was *subject-matter code* — a module that decides what the OHSA and COIDA
each require and by when, and another that computes injury rates against the
hours the timesheets actually recorded. Neither is CRUD, and neither could have
been bought by better foundations.

That is a useful correction to the claim, not a contradiction of it. The
foundation removes the plumbing; it was never going to remove the domain. What
the three previous modules showed is that the plumbing stays removed, and this
one shows the same.

It also depends on an earlier module in a way none of the others did: the
safety rates divide by hours worked, and those come from the timesheets. A
contractor asked for its injury rate normally guesses the denominator. This one
does not have to.

That is the claim the walking skeleton was built to test, now with evidence
from four modules: each one after the first is CRUD on proven rails, plus
whatever the subject itself genuinely requires.

## The input layer

A gap worth recording, because of how it happened. Each module was built as
read-and-act — view the register, tick the checklist, approve the thing,
progress the deal — and every slice was proven against seeded data. Seeded
data never needs a form, so none got built. Thirteen creation paths existed as
tested services; four had a button.

The most telling omission was "start a project from a won tender", the
handoff the whole platform is arranged around. Fully implemented, tested six
ways, reachable only from the seed script.

All thirteen now have a path: full pages for tenders, customers, leads,
opportunities and projects; inline forms for contacts, team members,
milestones, tasks and costs; and a "Start project" button on any won tender.

Two things fell out of building it. Validation had to surface against the
field that caused it, which meant the same Zod schema the service parses is
now also what the form renders errors from — one definition, two uses. And a
user without create permission was being redirected to a module list they
often could not see either, producing a second error instead of a graceful
exit; they now land on the dashboard.

The seed also deliberately leaves one won tender unconverted, so the handoff
has something to act on. Without it the feature is real but undemonstrable.
