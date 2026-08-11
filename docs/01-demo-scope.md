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
      enough if you own or submitted the tender. (Enforced and tested in the
      service; the server action wrapping it is still to come.)
- [ ] A 40MB PDF uploads successfully without passing through a function
- [ ] Uploading the same document twice creates version 2, and version 1 is
      still retrievable
- [x] The checklist marks a tender non-submittable while a required document is
      missing, and the submit button is enforced server-side
- [ ] Approval fires both an in-app notification and an email
- [x] `audit_logs` contains a complete, readable chain for the tender's life
- [x] Deleting a tender sets `deleted_at` and it vanishes from lists, but the
      row and its audit history remain
- [ ] Both dashboard widgets read from the metrics layer, not from Prisma
- [ ] The cron job runs on Vercel and emits a 30-day expiry warning
- [ ] Sentry captures a deliberately thrown error in production

## Explicitly not in the skeleton

Cut ruthlessly. These are Phase 2+ and adding them now defeats the purpose:

CRM, HR, Projects, Procurement, Inventory, Assets, Finance, HSE, tender pricing
build-up, proposal document generation, configurable dashboards, report builder,
exports, SMS or WhatsApp channels, bulk import, and search.

## Two stages

**Stage 1 — skeleton.** Correctness over appearance. Default shadcn styling,
no custom design work. Ends when the acceptance criteria above pass.
Roughly 2–3 weeks.

**Stage 2 — polish.** Only after Stage 1 passes. Real branding, considered
empty states, loading skeletons, a seeded dataset that looks like a plausible
mid-size contractor rather than "Test Tender 1", and a rehearsed demo script.
Roughly 1 week.

Do not interleave these. Polishing a skeleton you might still tear up is the
most reliable way to waste a week.

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
