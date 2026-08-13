/**
 * The tender lifecycle map.
 *
 * A South African tendering business does not run "find tender → submit →
 * win". It runs a chain that starts before an opportunity is published and
 * ends long after the contract closes, and every link feeds the next one:
 *
 *   Market intelligence → Discovery → Qualification → Bid/no-bid →
 *   Compliance → Preparation → Pricing → Technical response → Submission →
 *   Evaluation → Clarifications → Award → Contracting → Mobilisation →
 *   Delivery → Invoicing → Close-out → Performance record
 *
 * This file is the single description of that chain and of how much of it the
 * platform currently covers. The preview screens and the lifecycle map both
 * read from it, so the two can never drift apart.
 *
 * Nothing here is persisted. It is a map of intent, reviewed before the
 * modules behind it are built — see docs/03-tender-lifecycle-preview.md.
 */

/**
 * How much of a stage exists today.
 *
 *   live    — built, wired to the database, usable now
 *   partial — built in part; the rest is drawn in the preview
 *   preview — designed and demonstrable here, not yet backed by tables
 *   soon    — deliberately not designed yet, because it depends on a module
 *             that does not exist. Marked, not guessed at.
 */
export type StageState = "live" | "partial" | "preview" | "soon";

export interface LifecycleStage {
  key: string;
  /** Position in the chain, 1-based, for the numbered rail. */
  step: number;
  name: string;
  /** What the business is actually doing at this point. */
  purpose: string;
  state: StageState;
  /** Where this stage lives in the product today, when it lives anywhere. */
  href?: string;
  /** What is already built, in the user's language rather than the schema's. */
  built?: string;
  /** What is still missing, and honestly so. */
  missing?: string;
  /** The module this stage waits on, when it is blocked. */
  dependsOn?: string;
}

export const LIFECYCLE: LifecycleStage[] = [
  {
    key: "market-intelligence",
    step: 1,
    name: "Market intelligence",
    purpose:
      "Know which buyers are spending, on what, and who keeps winning it before the advert appears.",
    state: "preview",
    href: "/preview/intelligence",
    built: "Win rate and awarded value by sector, client and value band, from our own bid history.",
    missing:
      "Competitor register, award-notice ingestion and buyer spend history.",
  },
  {
    key: "discovery",
    step: 2,
    name: "Tender discovery",
    purpose:
      "One inbox for every source: eTenders, municipal and provincial portals, SOEs, and private buyers.",
    state: "preview",
    href: "/preview/discovery",
    built: "Opportunity capture, typing and classification, with a fit score against the company profile.",
    missing: "Portal connectors and scheduled scraping.",
    dependsOn: "Integrations",
  },
  {
    key: "qualification",
    step: 3,
    name: "Opportunity qualification",
    purpose:
      "Screen out what we cannot legally or practically win, before anyone spends a day on it.",
    state: "preview",
    href: "/preview/qualification",
    built: "Eligibility screen against registrations, grading, turnover, BBBEE and geography.",
    missing: "Screening rules stored per service line rather than demonstrated.",
  },
  {
    key: "bid-no-bid",
    step: 4,
    name: "Bid / no-bid",
    purpose:
      "A scored, recorded decision — so nobody prepares a twenty-hour submission on a hunch.",
    state: "preview",
    href: "/preview/qualification#scorecard",
    built: "Weighted scorecard, threshold bands and a risk assessment across five risk classes.",
    missing: "Decision persistence and the approval step that locks it.",
  },
  {
    key: "compliance",
    step: 5,
    name: "Compliance",
    purpose:
      "Company-level documents valid on closing day: CSD, tax PIN, BBBEE, COID, insurance, CIDB.",
    state: "partial",
    href: "/compliance",
    built: "The expiry engine, the compliance register and dashboard warnings.",
    missing:
      "Statutory pack modelled by type, and per-tender validity checked against the closing date.",
  },
  {
    key: "preparation",
    step: 6,
    name: "Tender preparation",
    purpose:
      "Turn the tender document into a checklist with an owner and a deadline against every line.",
    state: "partial",
    href: "/preview/bid-workspace",
    built: "The requirement checklist, blocking submission while a mandatory line is open.",
    missing:
      "Requirement extraction from the document, the responsibility matrix and the bid team.",
  },
  {
    key: "pricing",
    step: 7,
    name: "Pricing",
    purpose:
      "Build the price from cost, not from a guess, and approve it before it leaves the building.",
    state: "preview",
    href: "/preview/pricing",
    built: "Cost build-up, bill of quantities, margin analysis and the pricing approval chain.",
    missing: "Rate library, supplier quotes and escalation modelling.",
    dependsOn: "Finance / Procurement",
  },
  {
    key: "technical",
    step: 8,
    name: "Technical response",
    purpose:
      "Methodology, programme, personnel and experience — the part that carries the functionality points.",
    state: "soon",
    built: "Personnel and experience records exist in outline on the readiness screen.",
    missing: "Proposal assembly from approved company content.",
    dependsOn: "Documents + HR",
  },
  {
    key: "submission",
    step: 9,
    name: "Submission",
    purpose:
      "One gate: complete, signed, priced, approved, in the right format, before the clock stops.",
    state: "partial",
    href: "/preview/submission",
    built: "Approval workflow, separation of duties and the audit trail.",
    missing: "Readiness gate, submission proof and the receipt record.",
  },
  {
    key: "evaluation",
    step: 10,
    name: "Evaluation tracking",
    purpose:
      "Follow the bid through administrative, functionality, price and preference scoring.",
    state: "preview",
    href: "/preview/submission#evaluation",
    built: "Evaluation stages with our scored position against the published criteria.",
    missing: "Points captured per tender rather than illustrated.",
  },
  {
    key: "clarifications",
    step: 11,
    name: "Clarifications",
    purpose:
      "Questions, addenda, presentations and due diligence, all against the bid they belong to.",
    state: "soon",
    missing: "Correspondence log linking tender, client, person and document.",
    dependsOn: "Documents + Communications",
  },
  {
    key: "award",
    step: 12,
    name: "Award",
    purpose: "Record the outcome — won, lost, disqualified or cancelled — and why.",
    state: "live",
    href: "/tenders",
    built: "Outcome capture, awarded value and the reason, feeding win-rate reporting.",
  },
  {
    key: "contracting",
    step: 13,
    name: "Contracting",
    purpose:
      "Turn the award into a contract: scope, KPIs, SLA, penalties, retention and guarantees.",
    state: "soon",
    missing: "Contract record, obligations register and guarantee tracking.",
    dependsOn: "Finance / Legal",
  },
  {
    key: "mobilisation",
    step: 14,
    name: "Mobilisation",
    purpose: "Assign the manager, the team, the plant and the suppliers, and set the baseline.",
    state: "partial",
    href: "/projects",
    built: "A won tender becomes a project carrying its client, value and link back to the bid.",
    missing: "Mobilisation checklist, plant assignment and supplier appointment.",
    dependsOn: "Assets / Procurement",
  },
  {
    key: "delivery",
    step: 15,
    name: "Delivery",
    purpose: "Tasks, milestones, progress and cost against the budget that was priced.",
    state: "live",
    href: "/projects",
    built: "Tasks, milestones, team, costs and a budget counting approved spend as committed.",
  },
  {
    key: "invoicing",
    step: 16,
    name: "Invoicing & payment",
    purpose: "Contract value → work completed → claim → invoice → payment → retention.",
    state: "soon",
    missing: "Progress claims, invoices, debtors and cash flow.",
    dependsOn: "Finance",
  },
  {
    key: "closeout",
    step: 17,
    name: "Close-out",
    purpose:
      "Completion certificate, final account, retention release, sign-off and lessons learned.",
    state: "soon",
    missing: "Close-out pack and the reference letter that feeds the next bid.",
    dependsOn: "Finance",
  },
  {
    key: "performance",
    step: 18,
    name: "Performance record",
    purpose:
      "Every finished job becomes reusable evidence — because the next tender asks for it.",
    state: "preview",
    href: "/preview/readiness#experience",
    built: "Experience database and personnel records, matched to a tender's stated requirements.",
    missing: "Completion certificates and client references attached as evidence.",
  },
];

/**
 * Layers that run underneath the chain rather than at one point in it.
 * A tender touches all of them; none of them is a stage.
 */
export interface SupportingLayer {
  key: string;
  name: string;
  purpose: string;
  state: StageState;
  href?: string;
  detail: string;
  dependsOn?: string;
}

export const SUPPORTING_LAYERS: SupportingLayer[] = [
  {
    key: "readiness",
    name: "Tender readiness",
    purpose: "Being able to bid at all",
    state: "preview",
    href: "/preview/readiness",
    detail:
      "Company profile, statutory pack, industry registrations and supplier-database registration in one place, each with an expiry the system watches.",
  },
  {
    key: "people",
    name: "Personnel & experience",
    purpose: "The evidence tenders score",
    state: "preview",
    href: "/preview/readiness#experience",
    detail:
      "CVs, qualifications, professional registrations and a reusable project record, matched against what a tender asks for.",
    dependsOn: "HR",
  },
  {
    key: "partners",
    name: "Suppliers, subcontractors & JVs",
    purpose: "Capability we do not hold in-house",
    state: "soon",
    detail:
      "Partner compliance, BBBEE status, capacity and agreements, attached to the bid that relies on them.",
    dependsOn: "Procurement",
  },
  {
    key: "documents",
    name: "Document workspace",
    purpose: "Every tender is its own file room",
    state: "soon",
    detail:
      "Versioned tender documents, addenda and returnable schedules. The schema and versioning exist; direct upload needs blob storage credentials.",
    dependsOn: "Vercel Blob",
  },
  {
    key: "notifications",
    name: "Notifications & expiry",
    purpose: "Nothing is missed by accident",
    state: "partial",
    href: "/compliance",
    detail:
      "Closing dates, briefing dates, expiring certificates and pending approvals. In-app warnings are live; email and the nightly sweep need credentials.",
    dependsOn: "Resend",
  },
  {
    key: "governance",
    name: "Roles, permissions & audit",
    purpose: "Who may see, do and approve",
    state: "live",
    href: "/audit",
    detail:
      "Per-tenant roles over a fixed permission catalogue, separation of duties on approvals, and an audit row written on every change.",
  },
  {
    key: "reporting",
    name: "Reporting & intelligence",
    purpose: "Which bids are worth chasing",
    state: "partial",
    href: "/reports",
    detail:
      "Opportunity and tender level reports, win/loss by sector, client and value band, built on the metrics layer.",
  },
  {
    key: "ai",
    name: "AI assistance",
    purpose: "The work nobody wants to do by hand",
    state: "soon",
    detail:
      "Document scanning into a requirement checklist, bid/no-bid recommendation, compliance gap check and proposal drafting from approved company content.",
    dependsOn: "AI layer",
  },
];

export const STATE_LABELS: Record<StageState, string> = {
  live: "Live",
  partial: "Partly live",
  preview: "Preview",
  soon: "Coming soon",
};

export const STATE_TONES: Record<
  StageState,
  "success" | "accent" | "warning" | "neutral"
> = {
  live: "success",
  partial: "accent",
  preview: "warning",
  soon: "neutral",
};

export function lifecycleCounts() {
  const all = [...LIFECYCLE, ...SUPPORTING_LAYERS];
  return {
    live: all.filter((s) => s.state === "live").length,
    partial: all.filter((s) => s.state === "partial").length,
    preview: all.filter((s) => s.state === "preview").length,
    soon: all.filter((s) => s.state === "soon").length,
    total: all.length,
  };
}
