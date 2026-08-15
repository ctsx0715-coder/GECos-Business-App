# Tender Lifecycle — Preview

## What this is

A walkable preview of the layers a South African tendering business runs that
the platform does not yet cover. It is a **discovery instrument, not a
feature**: nothing on the preview screens is saved, and the figures are
demonstration data.

The purpose is the one recorded in [`01-demo-scope.md`](01-demo-scope.md):
nobody describes their real process accurately in a meeting, and everybody
corrects a screen that gets it wrong. Take notes on every place the client says
"actually, we do it differently". That list is worth more than the specification
this was built from.

Reachable at **`/preview`**, linked from the top navigation as *Lifecycle
preview* — styled apart from the working modules deliberately, because a
demonstration screen that looks identical to a built one is how a client ends up
believing they bought it.

## The chain

The lifecycle is eighteen stages, not "find tender → submit → win":

```
Market intelligence → Discovery → Qualification → Bid/no-bid → Compliance →
Preparation → Pricing → Technical response → Submission → Evaluation →
Clarifications → Award → Contracting → Mobilisation → Delivery → Invoicing →
Close-out → Performance record
```

Each stage carries one of four states, and `/preview` shows the count of each:

| State | Meaning |
|---|---|
| **Live** | Built, wired to the database, usable now |
| **Partly live** | Core built; the surrounding layer is drawn in the preview |
| **Preview** | Designed here with demonstration data, not yet backed by tables |
| **Coming soon** | Deliberately not designed, because it depends on a module that does not exist. Named, not guessed at |

`src/lib/preview/lifecycle.ts` is the single description of the chain. The map
screen and the tender report both read from it, so the two cannot drift apart.
A test enforces that anything marked *coming soon* names its dependency and
that anything marked *live* links somewhere.

## The preview screens

| Screen | Covers | Notes |
|---|---|---|
| `/preview` | The whole chain and eight supporting layers | Coverage map |
| `/preview/readiness` | Company profile, statutory pack, insurance, industry registrations, CSD and buyer databases, personnel, experience database | The expiry engine behind it is live |
| `/preview/discovery` | Sources, opportunity types, matched opportunities with a fit score | Portal connectors are the missing half |
| `/preview/qualification` | Eligibility screening, weighted bid/no-bid scorecard, five-class risk register | The weights are what to correct |
| `/preview/bid-workspace` | Requirement extraction, compliance matrix, bid team | The checklist underneath is live |
| `/preview/pricing` | Cost build-up, bill of quantities, margin, approval chain, revisions | Arithmetic is real; money is integer cents |
| `/preview/submission` | Readiness gate, proof of submission, evaluation tracking, post-submission | The approval chain behind it is live |
| `/preview/intelligence` | Win rate by sector and buyer (**live**), competitors (preview) | The contrast is the argument for evaluation tracking |

One tender — *TN-2026-0117, LED street lighting for the City of Tshwane* — runs
through the workspace, pricing and submission screens, so the preview reads as a
single bid rather than eight unrelated mock-ups.

## Reporting, which is not a preview

The reporting asked for alongside the preview is **built and live**, computed
from the tenant's own data through the metrics layer (ADR-005):

- **`/reports`** — bid funnel with conversion at each step, twelve-month trend,
  and win rate by contract size, by sector and by buyer.
- **`/tenders/[id]/report`** — lifecycle position, submission readiness against
  mandatory requirements, approvals, connected opportunity and project, and our
  track record with that buyer and in that sector.
- **`/crm/opportunities/[id]/report`** — stage progression, weighted value,
  engagement, a warning when a deal has gone quiet or run past its close date,
  and how deals with that client have gone before.

Queries live in `src/lib/analytics/reporting.ts`. They are raw SQL, so they
bypass the tenancy extension and carry `organisationId` explicitly — which is
why `tests/reporting.test.ts` seeds a second tenant in the isolation cases
rather than trusting the pattern.

Where a report would need a layer that does not exist — the bid/no-bid score,
the submitted price and margin, evaluation points and competitors — the panel
says so and names the dependency. An invented number on a report is worse than
an absent one.

## What is deliberately not here

No schema changes, no migrations, no new tables. The preview is intended to be
argued with and partly thrown away; adding tables to support screens that have
not been agreed is how a system acquires columns nobody can explain.

The one exception is the reporting above, which needed no schema either — it
reads what the tenders, opportunities, requirements, approvals and audit rows
already hold.

## Verifying it

```bash
pnpm dev
pnpm screenshots:lifecycle   # drives all 11 screens, asserts, captures
```

The screenshot script is a smoke test first and a camera second: it signs in,
visits every preview and reporting screen, asserts something specific on each,
and fails if a page renders an empty shell.

## What to decide before any of it is built

Ordered by how expensive the answer is to get wrong.

1. **Bid/no-bid weights and thresholds.** They differ per service line. The
   demonstrated model is a starting point, not a proposal.
2. **Which mandatory requirements are truly disqualifying**, and which merely
   lose points. The preview treats a failing mandatory requirement as a gate.
3. **Who approves a price**, and at what value an executive must sign.
4. **Whether pricing lives here or in the finance system.** The BOQ is a
   returnable schedule; the cost build-up holds supplier costs and margin, and
   the system storing both must know which may be exported.
5. **How much evaluation detail is obtainable in practice.** Competitor
   intelligence is only as good as what gets recorded at award, and it is the
   layer with the highest return if the discipline exists.
