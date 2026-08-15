import { isoDate } from "./public-holidays";

/**
 * Which days a person works, and therefore which days leave is charged for.
 *
 * Monday to Friday was assumed everywhere until this existed. On a
 * construction payroll that assumption is wrong more often than it is right:
 * site staff commonly work six days, and a plant operator on a rotation works
 * fourteen days and then takes seven. Both were being charged five days for a
 * week they would have worked six, or granted a Saturday they were rostered
 * for.
 *
 * A pattern is a repeating cycle: `cycleDays` long, with the positions in it
 * that are worked, counted from an anchor date. A seven-day cycle anchored on
 * a Monday makes index 0 Monday and reads as an ordinary week; a fourteen-day
 * cycle is the same shape without a special case.
 *
 * The counting lives here rather than with the holidays because the pattern is
 * what defines a working day in the first place. Holidays are subtracted from
 * it — they cannot be subtracted from a definition that does not exist yet.
 */

export interface WorkPatternShape {
  cycleDays: number;
  /** Positions within the cycle that are worked, 0-indexed from anchorOn. */
  workingDayIndexes: number[];
  anchorOn: Date;
}

/**
 * Monday 1 January 2024.
 *
 * A fixed Monday, so a seven-day pattern anchored here has index 0 on a
 * Monday and index 5 and 6 on the weekend, which is what anybody writing one
 * expects. Every seeded pattern uses it.
 */
export const PATTERN_ANCHOR = new Date(Date.UTC(2024, 0, 1));

/** Monday to Friday, for a tenant that has not configured anything. */
export const DEFAULT_PATTERN: WorkPatternShape = {
  cycleDays: 7,
  workingDayIndexes: [0, 1, 2, 3, 4],
  anchorOn: PATTERN_ANCHOR,
};

const DAY_MS = 86_400_000;

/** Where a date falls in the cycle. Always in range, including before the anchor. */
export function cycleIndexOf(pattern: WorkPatternShape, date: Date): number {
  const day = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const anchor = Date.UTC(
    pattern.anchorOn.getUTCFullYear(),
    pattern.anchorOn.getUTCMonth(),
    pattern.anchorOn.getUTCDate(),
  );

  const elapsed = Math.round((day - anchor) / DAY_MS);
  // Remainder in JavaScript keeps the sign of the dividend, so a date before
  // the anchor would land on a negative index and match nothing.
  return ((elapsed % pattern.cycleDays) + pattern.cycleDays) % pattern.cycleDays;
}

export function worksOn(pattern: WorkPatternShape, date: Date): boolean {
  return pattern.workingDayIndexes.includes(cycleIndexOf(pattern, date));
}

/** Working days a person would have worked, less any day the company is closed. */
export function workingDaysBetween(
  startsAt: Date,
  endsAt: Date,
  holidays: ReadonlySet<string> = new Set(),
  pattern: WorkPatternShape = DEFAULT_PATTERN,
): number {
  const start = new Date(
    Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(endsAt.getUTCFullYear(), endsAt.getUTCMonth(), endsAt.getUTCDate()),
  );
  if (end < start) return 0;

  let days = 0;
  for (const day = start; day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    if (!worksOn(pattern, day)) continue;
    if (holidays.has(isoDate(day))) continue;
    days += 1;
  }
  return days;
}

/**
 * The days in a range that this person is expected to work.
 *
 * The roster needs the list rather than the count, so it can show a week as
 * columns and mark the days somebody is not due in at all.
 */
export function workingDaysIn(
  from: Date,
  to: Date,
  holidays: ReadonlySet<string> = new Set(),
  pattern: WorkPatternShape = DEFAULT_PATTERN,
): string[] {
  const days: string[] = [];
  const day = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );

  for (; day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    if (!worksOn(pattern, day)) continue;
    if (holidays.has(isoDate(day))) continue;
    days.push(isoDate(day));
  }
  return days;
}

/**
 * A pattern in words: "Mon–Fri", "Mon–Sat", "14 days on, 7 off".
 *
 * Weekly patterns are named by their days, because that is how anybody
 * describes them. Anything longer is described by its shape, because nobody
 * reads "index 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13" as a fortnight on.
 */
export function describePattern(pattern: WorkPatternShape): string {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const worked = [...pattern.workingDayIndexes].sort((a, b) => a - b);

  if (pattern.cycleDays === 7) {
    if (worked.length === 0) return "No working days";
    if (worked.length === 7) return "Every day";

    const runs: number[][] = [];
    for (const index of worked) {
      const last = runs[runs.length - 1];
      if (last && index === last[last.length - 1] + 1) last.push(index);
      else runs.push([index]);
    }

    return runs
      .map((run) =>
        run.length > 2
          ? `${names[run[0]]}–${names[run[run.length - 1]]}`
          : run.map((index) => names[index]).join(", "),
      )
      .join(", ");
  }

  const on = worked.length;
  const off = pattern.cycleDays - on;
  return `${on} days on, ${off} off (${pattern.cycleDays}-day cycle)`;
}
