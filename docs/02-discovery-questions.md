# Discovery — What We Need From Nopedi

The architecture is currently built on our assumptions, not Nopedi's stated
requirements. That is survivable — the design is deliberately configurable in the
places most likely to be wrong — but the gaps below need closing before the
modules that depend on them get built.

Ordered by how expensive it is to get wrong.

## Blocking before Phase 1 ships

**Organisation shape.** How many employees, how many system users, how many
concurrent users at peak? Departments and reporting lines? One legal entity or
several? One site or several?

**Roles.** Who actually exists — not job titles, but who needs to see and do
what. The eight roles in the spec are invented. Ask for an org chart and a list
of "this person must never see that."

**Approval authority.** Who signs off on what, at what value, and who acts when
they are on leave. This directly configures the approval engine, and getting it
wrong is visible immediately.

**Existing systems.** What are they using now — Sage, Xero, Pastel, QuickBooks,
Excel, paper? What must the new system integrate with rather than replace, and
what data needs migrating? This is the single most common source of scope
surprise.

**Identity.** Do they have Microsoft 365 or Google Workspace? If so, SSO is
nearly free and materially improves adoption.

## Blocking before Tenders

- Which tender portals do they bid through — eTenders, CSD, municipal portals,
  private clients?
- Their actual submission checklist. The one in the spec is generic; theirs will
  have items we have never heard of.
- Do they bid as a JV or consortium? That changes the data model non-trivially.
- Who compiles a bid, who prices it, who approves it, who submits it?
- What does their current tender register look like — almost certainly a
  spreadsheet. Get a copy. It is the best requirements document available.

## Blocking before HR

**HR is now built, so these have moved from "before we start" to "before anyone
relies on the numbers".** Leave types and balances are seeded with the BCEA
statutory minimums, which is the legal floor rather than necessarily Nopedi's
policy. They are rows, so each answer below is a data change — but until they
are answered the balances on screen are a plausible guess, and a leave balance
that is quietly wrong is discovered in December.

- Are they on a bargaining council or sectoral determination? That constrains
  leave and overtime rules and is not negotiable.
- Leave types and accrual rules, including BCEA minimums versus their policy.
- Which certifications actually expire and matter — medicals, working at
  heights, first aid, forklift, electrical, PrEng, CIDB grading.
- Do they need payroll, or does payroll stay where it is? Assume it stays.
- Employment equity and BBBEE reporting obligations.
- How is attendance captured today — biometric, manual, site register?
- Which public holidays and shutdown periods do they observe? Leave currently
  counts Monday to Friday and does not deduct public holidays, which the
  request screen says outright rather than hiding.
- Does leave accrue monthly, or is it granted annually? The ledger is built;
  the rule that tops it up is deliberately absent.

## Blocking before Projects

- What is a "project" to them, and what is a "job"? These are often different
  things with different lifecycles, and the spec conflates them.
- Are they cost-reimbursable, fixed-price, or both?
- Do they need timesheets, and do timesheets need to feed costing?
- CIDB grading, retention, and progress claims — do these apply?

## Blocking before anyone relies on the stock figures

**Inventory is now built, so these have moved from "before we start" to "before
anyone acts on the numbers".** The ledger is right about what it has been told;
these decide whether it has been told the right things.

- **What do they actually hold, and where?** The register is built for things
  you count — cement, reinforcing, PPE, consumables. Ask for the current
  spreadsheet or the yard's stock book. It is the best requirements document
  available and it will contain items we have not thought of.
- **How is material issued today** — a signed requisition slip, a WhatsApp to
  the storeman, or nobody asks? We have deliberately not built a goods issue
  note as a numbered document somebody signs, because we do not know whether
  one exists. If it does, the ledger row is not enough and site disputes will
  prove it.
- **Do they count, and how often?** A month-end count of the main yard is
  assumed. If they count quarterly, or never, the variance the module surfaces
  will be enormous the first time and needs framing as a baseline rather than
  as a loss.
- **Who is allowed to write stock off, and at what value?** We have put it with
  finance and kept it away from the store, which is the defensible default. It
  is a real policy question and they may have an answer already.
- **Is stock valued for the accounts?** If their accountant already carries a
  stock figure, ours has to reconcile to it or one of the two is wrong in
  public. Weighted average is what we have implemented; confirm it is what they
  are on.
- **Serial or batch tracking** — do they need to know which reinforcing came
  off which mill certificate? Not built, and materially harder if the answer is
  yes.
- **Consignment stock**: does any supplier leave material on site that they
  still own until it is used? It is on the yard and it is not ours, and the
  register currently cannot say so.

## Blocking before Finance

- Which accounting package, and does it have a usable API?
- Where does the boundary sit — is the platform the system of record for
  invoices, or does it hand off to accounting?
- VAT handling, and multi-currency (probably not, but confirm).

## Compliance and legal

- POPIA: has an Information Officer been appointed? Are they comfortable with
  data hosted in the EU under Section 72, or does any client contract impose a
  stricter residency term?
- Do any of their public-sector clients impose IT or hosting requirements?
- Document retention periods for employee and HSE records.

## How to get these answered

Do not send this list as a questionnaire. It will come back half-filled and
optimistic.

Build the skeleton, demo it, and work through these while they are looking at
something concrete. Ask to see their current spreadsheets and forms — what people
actually use is more truthful than what they say they do.
