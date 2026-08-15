/**
 * Shift arithmetic: how long a shift is, and how to say it out loud.
 *
 * A shift is a time of day, not a moment, so everything here is minutes from
 * midnight. That is what makes a night shift expressible at all: 18:00 to
 * 06:00 is a perfectly ordinary shift that happens to end on the following
 * date, and a pair of timestamps would need a date attached before it could
 * say so.
 */

export interface ShiftShape {
  startsAtMinutes: number;
  endsAtMinutes: number;
  breakMinutes: number;
}

const MINUTES_IN_DAY = 24 * 60;

/** A shift that does not end after it starts runs past midnight. */
export function crossesMidnight(shift: ShiftShape): boolean {
  return shift.endsAtMinutes <= shift.startsAtMinutes;
}

/** Minutes from clocking on to clocking off, break included. */
export function spanMinutes(shift: ShiftShape): number {
  const raw = shift.endsAtMinutes - shift.startsAtMinutes;
  return raw > 0 ? raw : raw + MINUTES_IN_DAY;
}

/** Paid minutes: the span, less the unpaid break. */
export function workedMinutes(shift: ShiftShape): number {
  return Math.max(spanMinutes(shift) - shift.breakMinutes, 0);
}

export function workedHours(shift: ShiftShape): number {
  return Math.round((workedMinutes(shift) / 60) * 100) / 100;
}

/** 420 → "07:00". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** "07:00–16:00" for a day shift, "18:00–06:00 (+1)" for a night. */
export function describeShift(shift: ShiftShape): string {
  const window = `${formatMinutes(shift.startsAtMinutes)}–${formatMinutes(
    shift.endsAtMinutes,
  )}`;
  return crossesMidnight(shift) ? `${window} (+1)` : window;
}

/** "07:00" back to 420, for a form field. Invalid text becomes null. */
export function parseMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
