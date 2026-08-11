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

- Are they on a bargaining council or sectoral determination? That constrains
  leave and overtime rules and is not negotiable.
- Leave types and accrual rules, including BCEA minimums versus their policy.
- Which certifications actually expire and matter — medicals, working at
  heights, first aid, forklift, electrical, PrEng, CIDB grading.
- Do they need payroll, or does payroll stay where it is? Assume it stays.
- Employment equity and BBBEE reporting obligations.
- How is attendance captured today — biometric, manual, site register?

## Blocking before Projects

- What is a "project" to them, and what is a "job"? These are often different
  things with different lifecycles, and the spec conflates them.
- Are they cost-reimbursable, fixed-price, or both?
- Do they need timesheets, and do timesheets need to feed costing?
- CIDB grading, retention, and progress claims — do these apply?

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
