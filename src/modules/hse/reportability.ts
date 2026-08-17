/**
 * What the law wants told, to whom, and by when.
 *
 * A South African employer owes two separate duties after an incident and they
 * are constantly confused with each other, because both are filed within seven
 * days and both feel like "reporting the accident":
 *
 *   - **OHSA section 24** reports to an inspector of the Department of
 *     Employment and Labour. It is about whether the workplace is dangerous.
 *     A near miss that hurt nobody can owe it; a cut finger does not.
 *   - **COIDA section 39** reports to the Compensation Fund. It is about
 *     whether an injured worker gets paid. A cut finger that needed a doctor
 *     owes it; a spill that hurt nobody does not.
 *
 * They are different duties with different triggers, different forms and, as
 * it happens, different clocks: section 24 runs from when the incident
 * happened, section 39 from when the employer found out about it. On a site
 * where a man tells his foreman on Monday about a Friday injury, those are not
 * the same date, and only one of the two duties gives you the extra weekend.
 *
 * This works the answer out from the facts on the row every time it is asked,
 * rather than stamping a flag on at report time. Two reasons. The days
 * somebody could not work is usually unknown on the day and gets filled in a
 * week later — the flag would be stale the moment it was written. And the
 * rules here will be wrong somewhere; recomputing means a correction fixes the
 * whole register rather than only the incidents filed after the fix.
 *
 * It prompts; it does not decide. Whether an injury is "likely to cause a
 * permanent physical defect" is a doctor's judgement and whether to file is a
 * safety officer's, and neither of them works here. What this can do is make
 * sure nobody discovers on day eight that day seven was the deadline.
 */

/** The classification on the incident. Mirrors the `IncidentKind` enum. */
export type IncidentKind =
  | "NEAR_MISS"
  | "PROPERTY_DAMAGE"
  | "ENVIRONMENTAL"
  | "FIRST_AID"
  | "MEDICAL_TREATMENT"
  | "LOST_TIME"
  | "PERMANENT_DISABILITY"
  | "FATALITY";

/** Kinds where a person was hurt, as opposed to a thing or nothing at all. */
const INJURIES: ReadonlySet<IncidentKind> = new Set<IncidentKind>([
  "FIRST_AID",
  "MEDICAL_TREATMENT",
  "LOST_TIME",
  "PERMANENT_DISABILITY",
  "FATALITY",
]);

/** The fourteen days in section 24(1)(a), as days. */
export const SECTION_24_DAYS_OFF_WORK = 14;

/** Both written reports are due within seven days. */
export const FILING_DAYS = 7;

export interface IncidentFacts {
  kind: IncidentKind;
  occurredAt: Date;
  /** When it reached the employer. The COIDA clock starts here, not above. */
  reportedAt: Date;
  /** Days the injured person could not do their normal work. */
  daysUnableToWork: number | null;
  /** Section 24(1)(b)–(c): a major incident, a spill, a runaway machine. */
  dangerousOccurrence: boolean;
  reportedToDepartmentAt: Date | null;
  reportedToFundAt: Date | null;
}

export interface Filing {
  /** Who it goes to, in the words a person would use. */
  to: string;
  /** The section it is owed under, so an argument can be settled. */
  under: string;
  /** The prescribed form, because that is what somebody will go looking for. */
  form: string;
  /** Why this incident owes it. */
  because: string;
  dueBy: Date;
  filedAt: Date | null;
  overdue: boolean;
}

export interface Reportability {
  /** Filings the facts say are owed. */
  filings: Filing[];
  /** To be done before anybody tidies up. */
  atOnce: string[];
  /** Kept in the incident book for three years (GAR 9). */
  mustBeRecorded: boolean;
  /**
   * Questions whose answer would add a filing.
   *
   * Deliberately separate from `filings`. A duty nobody can yet know they owe
   * is not the same as one they owe, and folding the two together either cries
   * wolf on every sprained wrist or stays silent on the one that turns out to
   * be six weeks off work.
   */
  unanswered: string[];
}

function addDays(from: Date, days: number): Date {
  const out = new Date(from);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Whether the injury is bad enough to owe the Compensation Fund a report.
 *
 * First aid is left out: a plaster from the site box is not a claim, and
 * filing one for every splinter buries the real ones. Anything that needed a
 * doctor or cost a shift is in.
 */
function owesTheFund(kind: IncidentKind): boolean {
  return (
    kind === "MEDICAL_TREATMENT" ||
    kind === "LOST_TIME" ||
    kind === "PERMANENT_DISABILITY" ||
    kind === "FATALITY"
  );
}

export function reportability(
  facts: IncidentFacts,
  asAt: Date = new Date(),
): Reportability {
  const filings: Filing[] = [];
  const atOnce: string[] = [];
  const unanswered: string[] = [];

  const daysOff = facts.daysUnableToWork;

  // --- Section 24: is the workplace dangerous? ------------------------------

  const section24Because = (() => {
    if (facts.kind === "FATALITY") return "Somebody died.";
    if (facts.kind === "PERMANENT_DISABILITY") {
      return "The injury is expected to leave a permanent physical defect.";
    }
    if (daysOff !== null && daysOff >= SECTION_24_DAYS_OFF_WORK) {
      return `The injured person was unable to work for ${daysOff} days, which is ${SECTION_24_DAYS_OFF_WORK} or more.`;
    }
    if (facts.dangerousOccurrence) {
      return "A major incident, spillage, uncontrolled release or runaway machine put somebody in danger.";
    }
    return null;
  })();

  if (section24Because !== null) {
    const dueBy = addDays(facts.occurredAt, FILING_DAYS);
    filings.push({
      to: "Department of Employment and Labour",
      under: "OHSA s24(1)",
      form: "WCL.1",
      because: section24Because,
      dueBy,
      filedAt: facts.reportedToDepartmentAt,
      overdue: facts.reportedToDepartmentAt === null && asAt > dueBy,
    });
  } else if (facts.kind === "LOST_TIME" && daysOff === null) {
    // The commonest real case on the day it happens: somebody is off, nobody
    // yet knows for how long. Section 24 turns entirely on that number.
    unanswered.push(
      `How many days will they be off work? At ${SECTION_24_DAYS_OFF_WORK} or more this must go to the Department of Employment and Labour within ${FILING_DAYS} days of the incident.`,
    );
  }

  // --- Section 24(3): leave the scene alone --------------------------------

  if (facts.kind === "FATALITY" || facts.kind === "PERMANENT_DISABILITY") {
    atOnce.push(
      "Do not disturb the scene or move anything involved until an inspector consents (OHSA s24(3)).",
    );
    atOnce.push(
      "Tell the provincial director by phone now. The written report follows within seven days; the call does not wait for it.",
    );
  } else if (filings.length > 0) {
    atOnce.push(
      "Tell the provincial director by phone now. The written report follows within seven days; the call does not wait for it.",
    );
  }

  // --- Section 39: does an injured worker get paid? -------------------------

  if (owesTheFund(facts.kind)) {
    const dueBy = addDays(facts.reportedAt, FILING_DAYS);
    filings.push({
      to: "Compensation Fund",
      under: "COIDA s39(1)",
      form: "W.Cl.2",
      because:
        facts.kind === "FATALITY"
          ? "An employee died at work."
          : "An employee was injured to the point of needing medical treatment or time off.",
      dueBy,
      filedAt: facts.reportedToFundAt,
      overdue: facts.reportedToFundAt === null && asAt > dueBy,
    });
  }

  // --- GAR 9: the incident book --------------------------------------------

  // Every injury that cost the person their next day's normal work, and every
  // death. Kept three years, whether or not anything had to be filed — which
  // is why a first-aid case with a day off is in and a medical-treatment case
  // that lost no time is not.
  const mustBeRecorded =
    facts.kind === "FATALITY" ||
    facts.kind === "PERMANENT_DISABILITY" ||
    facts.kind === "LOST_TIME" ||
    (INJURIES.has(facts.kind) && daysOff !== null && daysOff > 0);

  return { filings, atOnce, mustBeRecorded, unanswered };
}

/** Filings past their date and still not filed. The list somebody chases. */
export function overdueFilings(report: Reportability): Filing[] {
  return report.filings.filter((filing) => filing.overdue);
}

/** Owed, not yet filed, and not yet late. */
export function outstandingFilings(report: Reportability): Filing[] {
  return report.filings.filter((filing) => filing.filedAt === null);
}

/**
 * Whole days from now until a filing is due. Negative once it is late.
 *
 * Days rather than hours because that is the unit the deadline is written in,
 * and a safety officer asking "how long have I got" wants "two days", not
 * "41 hours".
 */
export function daysUntil(dueBy: Date, asAt: Date = new Date()): number {
  const MS_PER_DAY = 86_400_000;
  return Math.floor((dueBy.getTime() - asAt.getTime()) / MS_PER_DAY);
}
