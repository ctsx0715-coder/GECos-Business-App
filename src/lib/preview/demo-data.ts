/**
 * Demo content for the lifecycle preview.
 *
 * None of this is persisted, and none of it comes from the database. It exists
 * so the layers we have not built yet can be argued about on a screen instead
 * of in a specification — the fastest way to find out that a client's real
 * process differs from the one we assumed (docs/01-demo-scope.md).
 *
 * Two rules held throughout:
 *
 *   - Money is integer cents, as everywhere else. The preview must not teach
 *     anyone that floats are acceptable here.
 *   - The figures are plausible for a mid-size South African contractor. A
 *     screen full of "Test Item 1" gets no useful correction from a client.
 *
 * One tender runs through the workspace, pricing and submission screens, so
 * the preview reads as a single bid rather than five unrelated mock-ups.
 */

const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

/** The bid the preview follows from capture to submission. */
export const DEMO_TENDER = {
  reference: "TN-2026-0117",
  tenderNumber: "CT-2026/ELEC-0043",
  title:
    "Supply, installation and maintenance of LED street lighting — Region 4",
  buyer: "City of Tshwane Metropolitan Municipality",
  department: "Roads and Transport",
  type: "Open tender",
  category: "Electrical infrastructure",
  industry: "Construction",
  subIndustry: "Electrical — public lighting",
  province: "Gauteng",
  location: "Region 4, Pretoria",
  durationMonths: 36,
  estimatedValueCents: 2_900_000_000n,
  publishedAt: days(-19),
  closingAt: days(9),
  briefingAt: days(-11),
  briefingCompulsory: true,
  briefingAttended: true,
  submissionMethod: "Sealed physical submission — tender box, Ground Floor",
  contactName: "M. Sithole",
  contactEmail: "tenders@tshwane.gov.za",
  addenda: 2,
};

// ---------------------------------------------------------------------------
// 1–2. Tender readiness — company, statutory pack, registrations, databases
// ---------------------------------------------------------------------------

export type ReadinessState = "valid" | "expiring" | "expired" | "missing";

export interface ReadinessItem {
  name: string;
  reference?: string;
  detail?: string;
  expiresAt?: Date;
  state: ReadinessState;
}

export interface ReadinessGroup {
  key: string;
  title: string;
  description: string;
  items: ReadinessItem[];
}

export const READINESS: ReadinessGroup[] = [
  {
    key: "statutory",
    title: "Statutory & tax",
    description: "The pack every organ of state asks for, without exception",
    items: [
      {
        name: "SARS Tax Compliance Status PIN",
        reference: "TCS 0142 8873",
        expiresAt: days(41),
        state: "valid",
      },
      {
        name: "VAT registration certificate",
        reference: "4290287731",
        state: "valid",
      },
      {
        name: "CIPC registration (CoR 14.3)",
        reference: "2014/118273/07",
        state: "valid",
      },
      {
        name: "BBBEE certificate",
        detail: "Level 1 · 135% procurement recognition",
        expiresAt: days(74),
        state: "expiring",
      },
      {
        name: "COID Letter of Good Standing",
        reference: "990018273",
        expiresAt: days(12),
        state: "expiring",
      },
      {
        name: "UIF registration",
        reference: "U190288331",
        state: "valid",
      },
      {
        name: "Bank confirmation letter",
        detail: "Standard Bank · dated within 3 months",
        expiresAt: days(-6),
        state: "expired",
      },
      {
        name: "Audited annual financial statements",
        detail: "FY2025 · signed by auditor",
        state: "valid",
      },
    ],
  },
  {
    key: "insurance",
    title: "Insurance",
    description: "Cover levels are read straight off the tender's requirements",
    items: [
      {
        name: "Public liability",
        detail: "R10 000 000 per occurrence",
        expiresAt: days(118),
        state: "valid",
      },
      {
        name: "Contractors all risk",
        detail: "R25 000 000",
        expiresAt: days(118),
        state: "valid",
      },
      {
        name: "Professional indemnity",
        detail: "R5 000 000",
        expiresAt: days(23),
        state: "expiring",
      },
      {
        name: "Motor fleet",
        detail: "14 vehicles",
        expiresAt: days(201),
        state: "valid",
      },
    ],
  },
  {
    key: "registrations",
    title: "Industry registrations",
    description: "What we may legally bid on, and at what size",
    items: [
      {
        name: "CIDB grading",
        detail: "6EB PE — electrical engineering works, building",
        expiresAt: days(88),
        state: "valid",
      },
      {
        name: "Department of Labour — electrical contractor",
        reference: "EC 27731",
        expiresAt: days(159),
        state: "valid",
      },
      {
        name: "ECA registration",
        detail: "Electrical Contractors' Association",
        state: "valid",
      },
      {
        name: "ISO 9001:2015",
        detail: "Quality management",
        expiresAt: days(312),
        state: "valid",
      },
      {
        name: "ISO 45001:2018",
        detail: "Occupational health & safety",
        state: "missing",
      },
      {
        name: "NHBRC",
        detail: "Not required for this service line",
        state: "missing",
      },
    ],
  },
  {
    key: "databases",
    title: "Supplier databases",
    description: "Being discoverable by the buyer in the first place",
    items: [
      {
        name: "Central Supplier Database (CSD)",
        reference: "MAAA0288731",
        detail: "Tax status verified · banking verified",
        expiresAt: days(203),
        state: "valid",
      },
      {
        name: "City of Tshwane supplier database",
        reference: "TSH-SD-118273",
        expiresAt: days(31),
        state: "expiring",
      },
      {
        name: "City of Johannesburg supplier database",
        reference: "COJ-2024-88112",
        state: "valid",
      },
      {
        name: "Eskom supplier database",
        detail: "Application submitted — awaiting vendor number",
        state: "missing",
      },
      {
        name: "Gauteng Provincial Treasury",
        reference: "GP-SD-44021",
        state: "valid",
      },
    ],
  },
];

/** 15–16. The people and the projects a technical response is scored on. */
export interface DemoPerson {
  name: string;
  role: string;
  qualification: string;
  registration?: string;
  yearsExperience: number;
  availability: string;
  cvUpdatedAt: Date;
  /**
   * Whether the CV is older than the 90 days most bid managers treat as the
   * shelf life of a CV. Derived here rather than in the component: a render
   * that reads the clock is not idempotent, and the lint rules say so.
   */
  cvIsStale: boolean;
}

const PERSONNEL: Omit<DemoPerson, "cvIsStale">[] = [
  {
    name: "T. Mokoena",
    role: "Contracts Manager",
    qualification: "BTech Electrical Engineering",
    registration: "ECSA Pr.Techni.Eng 201847",
    yearsExperience: 16,
    availability: "60% — committed to PRJ-2026-0031 until March",
    cvUpdatedAt: days(-44),
  },
  {
    name: "S. Naidoo",
    role: "Site Agent",
    qualification: "NDip Electrical Engineering",
    registration: "Wireman's Licence 88213",
    yearsExperience: 11,
    availability: "Available from month 1",
    cvUpdatedAt: days(-12),
  },
  {
    name: "P. van Wyk",
    role: "SHEQ Officer",
    qualification: "SAMTRAC · NEBOSH IGC",
    yearsExperience: 8,
    availability: "Shared across contracts",
    cvUpdatedAt: days(-140),
  },
  {
    name: "L. Dlamini",
    role: "Quantity Surveyor",
    qualification: "BSc QS (Hons)",
    registration: "SACQSP 4402",
    yearsExperience: 9,
    availability: "Available",
    cvUpdatedAt: days(-8),
  },
];

export const KEY_PERSONNEL: DemoPerson[] = PERSONNEL.map((person) => ({
  ...person,
  cvIsStale: Date.now() - person.cvUpdatedAt.getTime() > 90 * DAY,
}));

export interface DemoExperience {
  client: string;
  project: string;
  valueCents: bigint;
  completedAt: Date;
  scope: string;
  relevance: number;
  hasCertificate: boolean;
  hasReference: boolean;
}

/** 16. The reusable experience database, ranked against the demo tender. */
export const EXPERIENCE: DemoExperience[] = [
  {
    client: "City of Ekurhuleni",
    project: "Public lighting refurbishment — Kempton Park CBD",
    valueCents: 1_870_000_000n,
    completedAt: days(-220),
    scope: "1 840 LED luminaires, 62km reticulation, 24-month maintenance",
    relevance: 96,
    hasCertificate: true,
    hasReference: true,
  },
  {
    client: "Mogale City Local Municipality",
    project: "High-mast lighting installation and maintenance",
    valueCents: 940_000_000n,
    completedAt: days(-410),
    scope: "38 high masts, energy metering, 36-month term",
    relevance: 88,
    hasCertificate: true,
    hasReference: true,
  },
  {
    client: "Gauteng Department of Infrastructure Development",
    project: "Electrical maintenance — 11 clinics",
    valueCents: 2_310_000_000n,
    completedAt: days(-90),
    scope: "Term maintenance, standby generation, compliance certification",
    relevance: 71,
    hasCertificate: true,
    hasReference: false,
  },
  {
    client: "Tshwane Metropolitan Municipality",
    project: "Substation refurbishment — Rosslyn",
    valueCents: 3_120_000_000n,
    completedAt: days(-650),
    scope: "11kV switchgear replacement and protection",
    relevance: 64,
    hasCertificate: true,
    hasReference: true,
  },
];

// ---------------------------------------------------------------------------
// 3–6. Discovery — sources, opportunity types, the matched inbox
// ---------------------------------------------------------------------------

export interface DiscoverySource {
  name: string;
  category: "Government" | "SOE" | "Private" | "Municipal";
  newThisWeek: number;
  matched: number;
  state: "connected" | "manual" | "planned";
}

export const DISCOVERY_SOURCES: DiscoverySource[] = [
  { name: "eTenders National Portal", category: "Government", newThisWeek: 214, matched: 11, state: "planned" },
  { name: "City of Tshwane", category: "Municipal", newThisWeek: 38, matched: 6, state: "planned" },
  { name: "City of Johannesburg", category: "Municipal", newThisWeek: 44, matched: 4, state: "planned" },
  { name: "Gauteng Provincial Treasury", category: "Government", newThisWeek: 61, matched: 5, state: "planned" },
  { name: "Eskom", category: "SOE", newThisWeek: 27, matched: 3, state: "planned" },
  { name: "Transnet", category: "SOE", newThisWeek: 19, matched: 1, state: "planned" },
  { name: "Growthpoint Properties", category: "Private", newThisWeek: 6, matched: 2, state: "planned" },
  { name: "Captured by hand", category: "Private", newThisWeek: 3, matched: 3, state: "manual" },
];

/**
 * 4. Buyers use a dozen words for the same thing. The system treats them as
 * one entity with a type, not as a dozen separate features.
 */
export const OPPORTUNITY_TYPES = [
  { code: "RFT", label: "Request for Tender", note: "Full tender, priced against a scope" },
  { code: "RFQ", label: "Request for Quotation", note: "Low value, price-driven, short turnaround" },
  { code: "RFP", label: "Request for Proposal", note: "Solution-led, functionality weighted" },
  { code: "RFI", label: "Request for Information", note: "No award — informs a later bid" },
  { code: "EOI", label: "Expression of Interest", note: "Stage one of a two-stage process" },
  { code: "ITT", label: "Invitation to Tender", note: "Closed list of invited bidders" },
  { code: "IFB", label: "Invitation for Bid", note: "Common in SOE procurement" },
  { code: "PQ", label: "Prequalification", note: "Qualifies us to bid, does not award work" },
  { code: "PANEL", label: "Panel appointment", note: "Appointment to a roster, work by call-off" },
  { code: "FRAME", label: "Framework agreement", note: "Rates fixed, volumes drawn down" },
  { code: "TERM", label: "Term contract", note: "Recurring service over a fixed period" },
  { code: "SDP", label: "Supplier development", note: "Enterprise development programme" },
];

export interface DiscoveredOpportunity {
  reference: string;
  title: string;
  buyer: string;
  type: string;
  province: string;
  valueCents: bigint;
  closingAt: Date;
  match: number;
  reason: string;
  blocker?: string;
}

/** 47. What the matching engine would put in front of a bid manager. */
export const DISCOVERED: DiscoveredOpportunity[] = [
  {
    reference: "CT-2026/ELEC-0043",
    title: "LED street lighting — supply, install and maintain, Region 4",
    buyer: "City of Tshwane",
    type: "RFT",
    province: "Gauteng",
    valueCents: 2_900_000_000n,
    closingAt: days(9),
    match: 94,
    reason: "Exact service line, CIDB 6EB satisfied, 3 comparable projects",
  },
  {
    reference: "ESK-2026/DX-1187",
    title: "Distribution network maintenance — Tshwane cluster",
    buyer: "Eskom Distribution",
    type: "IFB",
    province: "Gauteng",
    valueCents: 8_900_000_000n,
    closingAt: days(21),
    match: 72,
    reason: "Service line matches, geography matches",
    blocker: "Requires CIDB 8EB — we hold 6EB. JV or no bid.",
  },
  {
    reference: "COJ-2026/INF-0912",
    title: "High-mast lighting refurbishment — Region G",
    buyer: "City of Johannesburg",
    type: "RFQ",
    province: "Gauteng",
    valueCents: 380_000_000n,
    closingAt: days(4),
    match: 89,
    reason: "Direct match to Mogale City experience, within grading",
  },
  {
    reference: "GDID-2026/EL-0221",
    title: "Electrical term maintenance — 14 schools, Sedibeng",
    buyer: "Gauteng Dept. Infrastructure Development",
    type: "TERM",
    province: "Gauteng",
    valueCents: 1_120_000_000n,
    closingAt: days(16),
    match: 81,
    reason: "Term maintenance track record, BBBEE Level 1 advantage",
  },
  {
    reference: "TRN-2026/PE-4471",
    title: "Port lighting and small power — Port Elizabeth",
    buyer: "Transnet National Ports Authority",
    type: "RFT",
    province: "Eastern Cape",
    valueCents: 4_200_000_000n,
    closingAt: days(28),
    match: 43,
    reason: "Service line matches",
    blocker: "Outside operating region — no local office or plant.",
  },
  {
    reference: "MOG-2026/EOI-018",
    title: "Panel of electrical contractors — 3 year framework",
    buyer: "Mogale City",
    type: "EOI",
    province: "Gauteng",
    valueCents: 0n,
    closingAt: days(6),
    match: 86,
    reason: "Panel appointment, existing client, no pricing at this stage",
  },
];

// ---------------------------------------------------------------------------
// 7–9. Qualification, bid/no-bid scoring, risk
// ---------------------------------------------------------------------------

export interface EligibilityCheck {
  requirement: string;
  required: string;
  weHave: string;
  result: "pass" | "fail" | "review";
}

export const ELIGIBILITY: EligibilityCheck[] = [
  { requirement: "CIDB grading", required: "6EB or higher", weHave: "6EB PE", result: "pass" },
  { requirement: "CSD registration", required: "Registered and verified", weHave: "MAAA0288731, verified", result: "pass" },
  { requirement: "Tax compliance", required: "Valid TCS PIN", weHave: "Valid, expires in 41 days", result: "pass" },
  { requirement: "BBBEE level", required: "Level 4 or better", weHave: "Level 1", result: "pass" },
  { requirement: "Annual turnover", required: "R25m over 3 years", weHave: "R41m average", result: "pass" },
  { requirement: "Similar projects", required: "3 × R15m+ in 5 years", weHave: "3 qualifying, 1 marginal", result: "pass" },
  { requirement: "Compulsory briefing", required: "Attendance certificate", weHave: "Attended, certificate on file", result: "pass" },
  { requirement: "Public liability cover", required: "R10 000 000", weHave: "R10 000 000", result: "pass" },
  { requirement: "Local content", required: "70% local luminaires", weHave: "Supplier confirmation pending", result: "review" },
  { requirement: "Subcontracting", required: "30% to EME/QSE", weHave: "Two partners identified, unsigned", result: "review" },
  { requirement: "ISO 45001", required: "Certified or equivalent", weHave: "Not certified — OHS file only", result: "fail" },
];

export interface ScoreCriterion {
  criterion: string;
  weight: number;
  score: number;
  note: string;
}

/** 8. The bid/no-bid model. Weights sum to 100. */
export const BID_SCORECARD: ScoreCriterion[] = [
  { criterion: "Technical capability", weight: 20, score: 8, note: "In-house crews, no new capability required" },
  { criterion: "Previous experience", weight: 15, score: 9, note: "Three directly comparable municipal contracts" },
  { criterion: "Compliance", weight: 15, score: 6, note: "Bank letter expired, ISO 45001 not held" },
  { criterion: "Pricing competitiveness", weight: 15, score: 7, note: "Rates within 4% of last winning bid" },
  { criterion: "BBBEE", weight: 10, score: 10, note: "Level 1 against a Level 4 requirement" },
  { criterion: "Financial capability", weight: 10, score: 7, note: "Working capital adequate; guarantee facility needed" },
  { criterion: "Geographic fit", weight: 5, score: 9, note: "Depot 18km from site" },
  { criterion: "Strategic value", weight: 5, score: 8, note: "First Tshwane term contract — opens the metro" },
  { criterion: "Probability of winning", weight: 5, score: 6, note: "Nine bidders expected at the briefing" },
];

export const SCORE_BANDS = [
  { min: 70, label: "Pursue", tone: "success" as const, note: "Proceed to bid preparation" },
  { min: 50, label: "Management review", tone: "warning" as const, note: "Executive decision required" },
  { min: 0, label: "No bid", tone: "danger" as const, note: "Decline and record the reason" },
];

export function scorecardTotal(rows: ScoreCriterion[] = BID_SCORECARD): number {
  return Math.round(
    rows.reduce((sum, row) => sum + (row.score / 10) * row.weight, 0),
  );
}

export function scoreBand(total: number) {
  return SCORE_BANDS.find((band) => total >= band.min) ?? SCORE_BANDS[2];
}

export interface RiskItem {
  category: "Commercial" | "Operational" | "Legal" | "Compliance" | "Strategic";
  risk: string;
  likelihood: "Low" | "Medium" | "High";
  impact: "Low" | "Medium" | "High";
  mitigation: string;
}

export const RISK_REGISTER: RiskItem[] = [
  {
    category: "Commercial",
    risk: "Penalty of R5 000 per day for lamps not restored within 48 hours",
    likelihood: "Medium",
    impact: "High",
    mitigation: "Price a standby crew into the maintenance rate",
  },
  {
    category: "Commercial",
    risk: "10% retention held for 12 months after practical completion",
    likelihood: "High",
    impact: "Medium",
    mitigation: "Cash-flow model assumes retention released in year 4",
  },
  {
    category: "Operational",
    risk: "Contracts Manager committed elsewhere until March",
    likelihood: "High",
    impact: "Medium",
    mitigation: "Site Agent leads mobilisation; handover in month 3",
  },
  {
    category: "Operational",
    risk: "Luminaire lead time of 14 weeks from a single importer",
    likelihood: "Medium",
    impact: "High",
    mitigation: "Second supplier quoted; order placed on award",
  },
  {
    category: "Legal",
    risk: "Unlimited consequential damages in the draft contract",
    likelihood: "Medium",
    impact: "High",
    mitigation: "Qualify in the tender response; legal review before signature",
  },
  {
    category: "Compliance",
    risk: "Bank confirmation letter expired six days ago",
    likelihood: "High",
    impact: "High",
    mitigation: "Reissue requested — mandatory returnable, disqualifies if absent",
  },
  {
    category: "Strategic",
    risk: "First contract with this metro — no delivery relationship yet",
    likelihood: "Medium",
    impact: "Low",
    mitigation: "Reference Ekurhuleni and Mogale performance in the response",
  },
];

// ---------------------------------------------------------------------------
// 10–14. The bid workspace — extraction, compliance matrix, team
// ---------------------------------------------------------------------------

export interface ExtractedRequirement {
  clause: string;
  requirement: string;
  kind: "Mandatory" | "Technical" | "Commercial" | "Evaluation";
  source: string;
}

/** 11. What document scanning would pull out of the tender pack. */
export const EXTRACTED_REQUIREMENTS: ExtractedRequirement[] = [
  { clause: "3.1", requirement: "Completed and signed SBD 1, 4, 6.1, 8 and 9", kind: "Mandatory", source: "Tender document p.4" },
  { clause: "3.4", requirement: "Valid CSD registration report", kind: "Mandatory", source: "Tender document p.5" },
  { clause: "3.7", requirement: "CIDB grading of 6EB or higher", kind: "Mandatory", source: "Tender document p.6" },
  { clause: "3.9", requirement: "Attendance certificate — compulsory briefing", kind: "Mandatory", source: "Addendum 1" },
  { clause: "4.2", requirement: "Original bank confirmation, dated within 3 months", kind: "Mandatory", source: "Tender document p.8" },
  { clause: "5.1", requirement: "1 240 LED luminaires to SANS 475, 5-year warranty", kind: "Technical", source: "Scope of work p.12" },
  { clause: "5.6", requirement: "48-hour fault restoration, 24/7 call centre", kind: "Technical", source: "Scope of work p.18" },
  { clause: "5.9", requirement: "Method statement and 36-month programme", kind: "Technical", source: "Scope of work p.21" },
  { clause: "6.3", requirement: "Rates fixed for 12 months, CPI escalation thereafter", kind: "Commercial", source: "Pricing schedule p.2" },
  { clause: "6.5", requirement: "10% performance guarantee within 21 days of award", kind: "Commercial", source: "Contract p.9" },
  { clause: "7.1", requirement: "Functionality 70 · Price 20 · Preference 10", kind: "Evaluation", source: "Tender document p.11" },
  { clause: "7.4", requirement: "Minimum 55 of 70 functionality points to proceed", kind: "Evaluation", source: "Tender document p.11" },
];

export interface MatrixRow {
  requirement: string;
  mandatory: boolean;
  owner: string;
  evidence: string;
  status: "complete" | "in_progress" | "blocked" | "not_started";
  dueAt: Date;
}

/** 12. The compliance matrix — one view of whether we can submit. */
export const COMPLIANCE_MATRIX: MatrixRow[] = [
  { requirement: "SBD forms 1, 4, 6.1, 8, 9", mandatory: true, owner: "Tender Office", evidence: "Signed forms", status: "complete", dueAt: days(2) },
  { requirement: "CSD registration report", mandatory: true, owner: "Compliance", evidence: "CSD report", status: "complete", dueAt: days(1) },
  { requirement: "Tax Compliance Status PIN", mandatory: true, owner: "Finance", evidence: "TCS PIN letter", status: "complete", dueAt: days(1) },
  { requirement: "BBBEE certificate", mandatory: true, owner: "Compliance", evidence: "Level 1 certificate", status: "complete", dueAt: days(1) },
  { requirement: "CIDB registration", mandatory: true, owner: "Compliance", evidence: "CIDB certificate", status: "complete", dueAt: days(1) },
  { requirement: "Briefing attendance certificate", mandatory: true, owner: "Tender Office", evidence: "Stamped certificate", status: "complete", dueAt: days(1) },
  { requirement: "Bank confirmation letter", mandatory: true, owner: "Finance", evidence: "Bank letter", status: "blocked", dueAt: days(3) },
  { requirement: "Public liability schedule", mandatory: true, owner: "Compliance", evidence: "Policy schedule", status: "complete", dueAt: days(2) },
  { requirement: "Company profile & organogram", mandatory: false, owner: "Marketing", evidence: "Profile PDF", status: "complete", dueAt: days(4) },
  { requirement: "Three reference letters", mandatory: true, owner: "Operations", evidence: "Client letters", status: "in_progress", dueAt: days(5) },
  { requirement: "Key personnel CVs", mandatory: true, owner: "Operations", evidence: "CVs + certificates", status: "in_progress", dueAt: days(5) },
  { requirement: "Method statement", mandatory: true, owner: "Technical", evidence: "Methodology", status: "in_progress", dueAt: days(6) },
  { requirement: "36-month programme", mandatory: true, owner: "Technical", evidence: "Programme", status: "not_started", dueAt: days(6) },
  { requirement: "Health & safety plan", mandatory: true, owner: "SHEQ", evidence: "OHS plan", status: "in_progress", dueAt: days(6) },
  { requirement: "Priced bill of quantities", mandatory: true, owner: "Estimating", evidence: "Priced BOQ", status: "in_progress", dueAt: days(7) },
  { requirement: "Subcontracting declaration (30%)", mandatory: true, owner: "Procurement", evidence: "Signed declaration", status: "not_started", dueAt: days(7) },
];

export interface TeamMember {
  role: string;
  person: string;
  responsibility: string;
  openItems: number;
}

/** 13. Who owns what on this bid. */
export const BID_TEAM: TeamMember[] = [
  { role: "Bid Manager", person: "T. Mokoena", responsibility: "Owns the submission and the deadline", openItems: 3 },
  { role: "Tender Administrator", person: "N. Khumalo", responsibility: "Forms, returnables, packaging, delivery", openItems: 1 },
  { role: "Compliance Officer", person: "R. Petersen", responsibility: "Statutory pack and validity on closing day", openItems: 1 },
  { role: "Estimator", person: "L. Dlamini", responsibility: "Bill of quantities and cost build-up", openItems: 2 },
  { role: "Technical Lead", person: "S. Naidoo", responsibility: "Methodology, programme and resources", openItems: 3 },
  { role: "SHEQ Officer", person: "P. van Wyk", responsibility: "Health, safety and environmental plan", openItems: 1 },
  { role: "Finance", person: "A. Botha", responsibility: "Bank letter, guarantees, cash-flow sign-off", openItems: 1 },
  { role: "Executive Approver", person: "D. Nkosi", responsibility: "Final approval to submit", openItems: 0 },
];

// ---------------------------------------------------------------------------
// 19–21. Pricing, bill of quantities, approval
// ---------------------------------------------------------------------------

export interface CostLine {
  category: string;
  amountCents: bigint;
  note: string;
}

export const COST_BUILDUP: CostLine[] = [
  { category: "Materials — luminaires & fittings", amountCents: 980_000_000n, note: "1 240 units, second supplier quoted" },
  { category: "Materials — cable & reticulation", amountCents: 214_000_000n, note: "62km, 10% waste allowance" },
  { category: "Labour", amountCents: 386_000_000n, note: "4 crews, 36 months incl. standby" },
  { category: "Plant & equipment", amountCents: 172_000_000n, note: "2 cherry pickers, internal hire rate" },
  { category: "Subcontractors", amountCents: 148_000_000n, note: "30% EME/QSE civils and trenching" },
  { category: "Transport & logistics", amountCents: 62_000_000n, note: "Depot 18km from site" },
  { category: "Project management", amountCents: 94_000_000n, note: "Site agent, QS, admin" },
  { category: "Health & safety", amountCents: 28_000_000n, note: "SHEQ officer, PPE, files" },
  { category: "Insurance & guarantees", amountCents: 41_000_000n, note: "CAR + 10% performance guarantee" },
];

export const PRICING_ASSUMPTIONS = {
  overheadPercent: 12,
  contingencyPercent: 4,
  marginPercent: 14,
  escalationNote: "Rates fixed 12 months, CPI thereafter (clause 6.3)",
};

export interface BoqLine {
  item: string;
  description: string;
  unit: string;
  quantity: number;
  rateCents: bigint;
}

/**
 * Rates are the selling rates, not cost: they carry overhead, contingency and
 * margin, so the BOQ total reconciles to the tender price excluding VAT rather
 * than to the direct cost. Rounding on individual rates leaves a few thousand
 * rand of difference, which the reconciliation line on the screen shows rather
 * than hides.
 */
export const BOQ: BoqLine[] = [
  { item: "1.1", description: "Supply 90W LED luminaire, SANS 475", unit: "No.", quantity: 1_240, rateCents: 772_000n },
  { item: "1.2", description: "Install luminaire on existing pole", unit: "No.", quantity: 1_240, rateCents: 168_000n },
  { item: "2.1", description: "Supply and install 4mm² armoured cable", unit: "m", quantity: 62_000, rateCents: 10_650n },
  { item: "2.2", description: "Trenching and reinstatement", unit: "m", quantity: 41_000, rateCents: 14_500n },
  { item: "3.1", description: "Replace defective pole, 8m galvanised", unit: "No.", quantity: 74, rateCents: 1_405_000n },
  { item: "4.1", description: "Routine maintenance visit", unit: "Month", quantity: 36, rateCents: 5_490_000n },
  { item: "4.2", description: "Emergency fault call-out, 48-hour SLA", unit: "No.", quantity: 420, rateCents: 211_000n },
];

export function boqTotalCents(lines: BoqLine[] = BOQ): bigint {
  return lines.reduce(
    (sum, line) => sum + BigInt(line.quantity) * line.rateCents,
    0n,
  );
}

export function directCostCents(lines: CostLine[] = COST_BUILDUP): bigint {
  return lines.reduce((sum, line) => sum + line.amountCents, 0n);
}

/** Cost → overhead → contingency → margin → VAT, the way an estimator builds it. */
export function pricingBuildUp() {
  const direct = directCostCents();
  const overhead = (direct * BigInt(PRICING_ASSUMPTIONS.overheadPercent)) / 100n;
  const contingency =
    (direct * BigInt(PRICING_ASSUMPTIONS.contingencyPercent)) / 100n;
  const cost = direct + overhead + contingency;
  const margin = (cost * BigInt(PRICING_ASSUMPTIONS.marginPercent)) / 100n;
  const exVat = cost + margin;
  const vat = (exVat * 15n) / 100n;

  return {
    direct,
    overhead,
    contingency,
    cost,
    margin,
    exVat,
    vat,
    inclVat: exVat + vat,
    // A displayed percentage, not money, so it is rounded rather than carried
    // in cents — integer division here truncated 12.28% to 12.2%.
    grossMarginPercent:
      Math.round((Number(margin) / Number(exVat)) * 1000) / 10,
  };
}

export interface PricingApproval {
  step: string;
  person: string;
  status: "approved" | "pending" | "waiting";
  decidedAt?: Date;
  note?: string;
}

/** 21. Nobody submits a price nobody approved. */
export const PRICING_APPROVALS: PricingApproval[] = [
  { step: "Estimator", person: "L. Dlamini", status: "approved", decidedAt: days(-2), note: "Rev 3 — second supplier quote applied" },
  { step: "Finance", person: "A. Botha", status: "approved", decidedAt: days(-1), note: "Cash flow accepted; guarantee facility confirmed" },
  { step: "Bid Manager", person: "T. Mokoena", status: "pending", note: "Reviewing margin against the last winning price" },
  { step: "Executive", person: "D. Nkosi", status: "waiting" },
];

/**
 * Revision 3 is the price the build-up above produces, excluding VAT. A
 * revision history that does not end at the current price is the first thing
 * anyone spots, and it is exactly the kind of drift a real pricing module has
 * to prevent.
 */
export const PRICING_REVISIONS = [
  { version: 3, priceCents: 2_810_100_000n, reason: "Second luminaire supplier, 6% lower material rate", at: days(-2) },
  { version: 2, priceCents: 2_931_000_000n, reason: "Standby crew added for the 48-hour SLA penalty", at: days(-5) },
  { version: 1, priceCents: 2_846_000_000n, reason: "First build-up off the BOQ", at: days(-8) },
];

// ---------------------------------------------------------------------------
// 24–28. Submission gate, evaluation, post-submission
// ---------------------------------------------------------------------------

export interface GateCheck {
  check: string;
  detail: string;
  passed: boolean;
}

/** 24. The final gate. Everything true, or it does not go. */
export const SUBMISSION_GATE: GateCheck[] = [
  { check: "Mandatory returnables complete", detail: "15 of 16 — bank confirmation outstanding", passed: false },
  { check: "All forms signed and initialled", detail: "SBD 1, 4, 6.1, 8, 9 signed by the authorised signatory", passed: true },
  { check: "Pricing approved", detail: "Awaiting Bid Manager and Executive", passed: false },
  { check: "Technical response complete", detail: "Programme not yet issued", passed: false },
  { check: "Compliance valid on closing day", detail: "All certificates valid past the closing date", passed: true },
  { check: "File naming and format", detail: "Matches the buyer's stated convention", passed: true },
  { check: "Copies and packaging", detail: "1 original, 2 copies, sealed and marked", passed: true },
  { check: "Delivery arranged", detail: "Hand delivery booked for the day before closing", passed: true },
];

export interface EvaluationStage {
  stage: string;
  weight?: number;
  ourScore?: number;
  threshold?: number;
  status: "passed" | "in_progress" | "pending";
  note: string;
}

/** 27. Where the bid sits in the buyer's evaluation. */
export const EVALUATION: EvaluationStage[] = [
  { stage: "Administrative compliance", status: "passed", note: "All returnables accepted, no disqualification" },
  { stage: "Functionality", weight: 70, ourScore: 61, threshold: 55, status: "passed", note: "Above the 55-point threshold to proceed" },
  { stage: "Price", weight: 20, ourScore: 17, status: "in_progress", note: "Scored against the lowest acceptable bid" },
  { stage: "Preference (BBBEE)", weight: 10, ourScore: 10, status: "passed", note: "Level 1 — full preference points" },
  { stage: "Negotiation / shortlist", status: "pending", note: "Two bidders expected to be shortlisted" },
];

export interface PostSubmissionEvent {
  at: Date;
  kind: "Clarification" | "Addendum" | "Presentation" | "Due diligence" | "Submission";
  summary: string;
  responded: boolean;
}

export const POST_SUBMISSION: PostSubmissionEvent[] = [
  { at: days(-11), kind: "Addendum", summary: "Addendum 2 — closing date extended by 7 days", responded: true },
  { at: days(-7), kind: "Clarification", summary: "Asked whether existing poles are structurally certified", responded: true },
  { at: days(-4), kind: "Clarification", summary: "Buyer confirmed 30% subcontracting is measured on the contract value", responded: true },
  { at: days(-1), kind: "Presentation", summary: "Technical presentation requested for shortlisted bidders", responded: false },
];

export const SUBMISSION_RECORD = {
  method: "Sealed physical submission — tender box",
  address: "Ground Floor, Tshwane House, 320 Madiba Street, Pretoria",
  submittedAt: days(-1),
  submittedBy: "N. Khumalo",
  receiptReference: "TB-2026-04412",
  acknowledged: true,
};

// ---------------------------------------------------------------------------
// 36. Competitor intelligence
// ---------------------------------------------------------------------------

export interface Competitor {
  name: string;
  metThisYear: number;
  wonAgainstUs: number;
  lostToUs: number;
  averagePriceDelta: number;
  note: string;
}

export const COMPETITORS: Competitor[] = [
  { name: "Bosele Electrical (Pty) Ltd", metThisYear: 7, wonAgainstUs: 4, lostToUs: 2, averagePriceDelta: -6.4, note: "Consistently prices below us on luminaire supply" },
  { name: "Rithlo Projects", metThisYear: 5, wonAgainstUs: 1, lostToUs: 3, averagePriceDelta: 3.1, note: "Stronger on functionality, weaker on price" },
  { name: "Kagiso Power Services", metThisYear: 4, wonAgainstUs: 2, lostToUs: 1, averagePriceDelta: -1.8, note: "Also Level 1 — preference points cancel out" },
  { name: "Vulindlela Infrastructure", metThisYear: 3, wonAgainstUs: 0, lostToUs: 2, averagePriceDelta: 8.7, note: "Prices high, wins on complex scope" },
];
