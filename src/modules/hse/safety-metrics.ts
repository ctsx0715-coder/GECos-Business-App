import type { IncidentKind } from "./reportability";

/**
 * The safety numbers, measured against hours that were actually worked.
 *
 * An injury count on its own says nothing. Three lost-time injuries is a good
 * year for a company of four hundred and a catastrophe for a company of six,
 * so the industry divides by hours worked and multiplies back up to a common
 * base. Every contractor is asked for these figures — by clients in a
 * pre-qualification, by the Department in an audit, by an insurer at renewal —
 * and most of them arrive at the number by guessing the hours.
 *
 * This does not have to guess, because the timesheets are in the same
 * database. That is the whole reason this module exists rather than a field
 * somebody types a rate into: the denominator is real.
 *
 * The base is 200 000 hours, which is where the convention comes from — one
 * hundred people working forty hours for fifty weeks. A rate of 1.0 therefore
 * means "about one injury per hundred people per year", which is the sentence
 * to say out loud when somebody asks what the number means.
 *
 * One honesty measure is built in. On a small contractor's hours these rates
 * are extremely sensitive: a single injury can double the figure, and a
 * company that reports 4.2 one year and 8.4 the next has usually not got twice
 * as dangerous, it has had one more accident. So every rate is returned
 * alongside what it would become if one more happened, and any screen showing
 * the rate is expected to show that too. A safety statistic without its
 * sensitivity is a way of misleading a board with arithmetic.
 */

/** One hundred people, forty hours, fifty weeks. The industry's denominator. */
export const RATE_BASE_HOURS = 200_000;

/**
 * The hours below which the rate is arithmetic rather than a statistic.
 *
 * A quarter of the base — roughly twenty-five people for a year. It is a
 * judgement rather than a standard, and it is here because the alternative is
 * worse: two injuries against a fortnight of timesheets produces a rate in the
 * hundreds, which is a true division and a false statement. That figure is not
 * a bad safety record, it is not enough hours, and the difference matters
 * because the number gets copied into pre-qualification documents by people
 * who will not be told which it was.
 *
 * Below this the rate is still shown — a client asking for it does not accept
 * "we would rather not" — but it is shown next to what a single injury is
 * worth in rate points, which is the only honest way to print it.
 */
export const MEANINGFUL_HOURS = RATE_BASE_HOURS / 4;

/** Injuries that cost the person time off work. */
const LOST_TIME: ReadonlySet<IncidentKind> = new Set<IncidentKind>([
  "LOST_TIME",
  "PERMANENT_DISABILITY",
  "FATALITY",
]);

/**
 * Injuries that count as recordable.
 *
 * Everything in LOST_TIME plus treatment by a doctor. First aid is out — a
 * plaster is not a recordable injury in any of the standards, and counting it
 * makes a company that reports honestly look worse than one that does not.
 */
const RECORDABLE: ReadonlySet<IncidentKind> = new Set<IncidentKind>([
  ...LOST_TIME,
  "MEDICAL_TREATMENT",
]);

export interface CountableIncident {
  kind: IncidentKind;
  occurredAt: Date;
  daysUnableToWork: number | null;
}

export interface SafetyRecord {
  hoursWorked: number;
  lostTimeCount: number;
  recordableCount: number;
  daysLost: number;

  /** Lost-time injuries per 200 000 hours. Null when no hours were worked. */
  lostTimeRate: number | null;
  /** Recordable injuries per 200 000 hours. */
  recordableRate: number | null;
  /** Days lost per 200 000 hours — how bad, rather than how often. */
  severityRate: number | null;

  /**
   * What the lost-time rate becomes with one more injury.
   *
   * Shown next to the rate, always. See the note at the top of this file.
   */
  lostTimeRateWithOneMore: number | null;

  /**
   * What one injury is worth in rate points, at these hours.
   *
   * The sensitivity as a single number. At the base it is 1.0; at a fortnight
   * of timesheets it is in the hundreds, which is the fact that makes the rate
   * unusable and the one nobody prints.
   */
  ratePerInjury: number | null;

  /** Whether there are enough hours behind the rate to compare it to anybody. */
  enoughHoursForRate: boolean;

  lastLostTimeAt: Date | null;
  /** Null when there has never been one, which is not the same as zero. */
  daysSinceLastLostTime: number | null;
}

/** Rates are reported to one decimal place, which is all the precision there is. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Events per 200 000 hours worked.
 *
 * Null rather than zero when no hours were worked: a site that has not started
 * has no safety record, and printing 0.0 claims a clean one it has not earned.
 */
export function frequencyRate(count: number, hoursWorked: number): number | null {
  if (hoursWorked <= 0) return null;
  return round((count * RATE_BASE_HOURS) / hoursWorked);
}

export function lostTimeInjuries(
  incidents: readonly CountableIncident[],
): CountableIncident[] {
  return incidents.filter((incident) => LOST_TIME.has(incident.kind));
}

export function recordableInjuries(
  incidents: readonly CountableIncident[],
): CountableIncident[] {
  return incidents.filter((incident) => RECORDABLE.has(incident.kind));
}

/** Whole days between two moments, floored. */
export function daysSince(since: Date, asAt: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.floor((asAt.getTime() - since.getTime()) / MS_PER_DAY);
}

/** The most recent lost-time injury, which is what the sign on the gate counts. */
export function lastLostTime(
  incidents: readonly CountableIncident[],
): CountableIncident | null {
  return lostTimeInjuries(incidents).reduce<CountableIncident | null>(
    (latest, incident) =>
      latest === null || incident.occurredAt > latest.occurredAt ? incident : latest,
    null,
  );
}

export function safetyRecord(input: {
  incidents: readonly CountableIncident[];
  /** Minutes, because that is what a timesheet holds. Converted here once. */
  minutesWorked: number;
  asAt?: Date;
}): SafetyRecord {
  const asAt = input.asAt ?? new Date();
  const hoursWorked = Math.round(input.minutesWorked / 60);

  const lostTime = lostTimeInjuries(input.incidents);
  const recordable = recordableInjuries(input.incidents);
  const daysLost = lostTime.reduce(
    (total, incident) => total + (incident.daysUnableToWork ?? 0),
    0,
  );
  const last = lastLostTime(input.incidents);

  return {
    hoursWorked,
    lostTimeCount: lostTime.length,
    recordableCount: recordable.length,
    daysLost,

    lostTimeRate: frequencyRate(lostTime.length, hoursWorked),
    recordableRate: frequencyRate(recordable.length, hoursWorked),
    severityRate: frequencyRate(daysLost, hoursWorked),
    lostTimeRateWithOneMore: frequencyRate(lostTime.length + 1, hoursWorked),
    ratePerInjury: frequencyRate(1, hoursWorked),
    enoughHoursForRate: hoursWorked >= MEANINGFUL_HOURS,

    lastLostTimeAt: last?.occurredAt ?? null,
    daysSinceLastLostTime:
      last === null ? null : daysSince(last.occurredAt, asAt),
  };
}

/**
 * Actions grouped by where they sit in the hierarchy of control.
 *
 * A register that is nine-tenths "issue PPE" and "re-brief the team" has not
 * fixed anything — both controls depend on a person remembering, every day,
 * forever. Counting them is the only way that shows up before the same
 * incident happens again.
 */
export type ControlType =
  | "ELIMINATION"
  | "SUBSTITUTION"
  | "ENGINEERING"
  | "ADMINISTRATIVE"
  | "PPE";

/** Controls that keep working when nobody is paying attention. */
const HARD_CONTROLS: ReadonlySet<ControlType> = new Set<ControlType>([
  "ELIMINATION",
  "SUBSTITUTION",
  "ENGINEERING",
]);

export function isHardControl(control: ControlType): boolean {
  return HARD_CONTROLS.has(control);
}

/**
 * The share of corrective actions that change the job rather than the worker.
 *
 * Null when there are no actions at all — a percentage of nothing is not zero
 * per cent, and showing 0% for a company that has had no incidents reads as an
 * accusation.
 */
export function hardControlShare(
  controls: readonly ControlType[],
): number | null {
  if (controls.length === 0) return null;
  const hard = controls.filter(isHardControl).length;
  return Math.round((hard / controls.length) * 100);
}
