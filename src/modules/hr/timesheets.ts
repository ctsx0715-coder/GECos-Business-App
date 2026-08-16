import type { ShiftShape } from "./shifts";
import { workedMinutes as shiftMinutes } from "./shifts";

/**
 * What was actually worked, against what was planned.
 *
 * Everything else in Work cycles is a plan. This is the record of what
 * happened, and the arithmetic that compares the two is where a payroll
 * argument is either settled or started.
 *
 * Two rules run through all of it. Time is stored as the two moments rather
 * than a duration, because "when did you leave" is the question in dispute and
 * a number of hours cannot answer it. And the total is always derived, never
 * stored, so there is no second figure to disagree with the times beside it.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface EntryShape {
  clockedInAt: Date;
  clockedOutAt: Date | null;
  breakMinutes: number;
}

/**
 * The working day a stretch of time belongs to.
 *
 * The day it *started*, not the day it ended. A night shift beginning at 18:00
 * on Tuesday and ending at 06:00 on Wednesday is Tuesday's work, and paying it
 * against Wednesday puts half a construction payroll in the wrong week.
 */
export function workingDayOf(clockedInAt: Date): Date {
  return new Date(
    Date.UTC(
      clockedInAt.getUTCFullYear(),
      clockedInAt.getUTCMonth(),
      clockedInAt.getUTCDate(),
    ),
  );
}

/** Minutes worked, less the unpaid break. Zero while somebody is still on. */
export function minutesWorked(entry: EntryShape): number {
  if (!entry.clockedOutAt) return 0;

  const elapsed = Math.round(
    (entry.clockedOutAt.getTime() - entry.clockedInAt.getTime()) / MINUTE_MS,
  );
  return Math.max(0, elapsed - entry.breakMinutes);
}

/** Minutes on the clock right now, for somebody who has not clocked out. */
export function minutesSoFar(entry: EntryShape, now = new Date()): number {
  if (entry.clockedOutAt) return minutesWorked(entry);
  return Math.max(
    0,
    Math.round((now.getTime() - entry.clockedInAt.getTime()) / MINUTE_MS) -
      entry.breakMinutes,
  );
}

/**
 * Whether a stretch of time is long enough to be a mistake.
 *
 * Somebody who forgets to clock out leaves an entry running until the next
 * morning, and paying it would be paying for a walk home and a night's sleep.
 * Flagged rather than truncated: the system does not know what happened, and
 * quietly rewriting somebody's hours to a number that suits it is worse than
 * asking.
 */
export function looksUnclosed(entry: EntryShape, now = new Date()): boolean {
  const end = entry.clockedOutAt ?? now;
  return end.getTime() - entry.clockedInAt.getTime() > 16 * 60 * MINUTE_MS;
}

/** Minutes beyond what the shift was worth, or 0. */
export function overtimeAgainst(
  entry: EntryShape,
  shift: ShiftShape | null,
): number {
  if (!shift) return 0;
  return Math.max(0, minutesWorked(entry) - shiftMinutes(shift));
}

/** Minutes short of what the shift was worth, or 0. */
export function undertimeAgainst(
  entry: EntryShape,
  shift: ShiftShape | null,
): number {
  if (!shift) return 0;
  return Math.max(0, shiftMinutes(shift) - minutesWorked(entry));
}

/** "8h 30m", "45m", "—". How hours are read aloud, rather than 8.5. */
export function describeDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** The time of day, as a clock reads it: "07:04". */
export function describeMoment(moment: Date): string {
  return `${String(moment.getUTCHours()).padStart(2, "0")}:${String(
    moment.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

/**
 * Whether two stretches of time overlap.
 *
 * One person cannot be at work twice at once, and an entry that overlaps
 * another is either a double clock-in or a correction somebody made without
 * closing the first. An open entry runs to now, so it overlaps anything that
 * starts after it.
 */
export function overlaps(a: EntryShape, b: EntryShape, now = new Date()): boolean {
  const aEnd = (a.clockedOutAt ?? now).getTime();
  const bEnd = (b.clockedOutAt ?? now).getTime();
  return a.clockedInAt.getTime() < bEnd && b.clockedInAt.getTime() < aEnd;
}

/** Whole days between two dates, for capping how far back a correction goes. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}
