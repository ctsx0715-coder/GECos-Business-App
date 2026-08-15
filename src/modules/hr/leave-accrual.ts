import type { LeaveAccrualMethod } from "@/generated/prisma/client";

/**
 * The accrual arithmetic, with no database in sight.
 *
 * Leave entitlement is the one number in this system an employee will check
 * against their own count, so the rule that produces it is written as pure
 * functions that a test can drive across a whole year in milliseconds. The
 * service does the reading and writing; everything that decides *how many
 * days* is here.
 *
 * Two methods, and the difference between them is what happens to somebody who
 * joins in March:
 *
 *   ANNUAL_GRANT     the cycle's full entitlement, once, on the later of the
 *                    cycle start and their first day. Not pro-rated — a policy
 *                    that grants 15 days grants 15 days.
 *   MONTHLY_ACCRUAL  a fixed number of days for each calendar month worked in
 *                    full, so a March joiner earns from April and arrives at
 *                    the right figure without anyone pro-rating anything.
 *
 * A cycle is the calendar year. That matches the seeded data and the way the
 * balances table was already being written; an organisation whose leave year
 * runs March to February is a policy answer we do not have yet
 * (docs/02-discovery-questions.md), and it changes this function only.
 */

export interface LeaveCycle {
  startsAt: Date;
  endsAt: Date;
}

/** The leave cycle containing `on`. */
export function cycleFor(on: Date): LeaveCycle {
  const year = on.getUTCFullYear();
  return {
    startsAt: new Date(Date.UTC(year, 0, 1)),
    endsAt: new Date(Date.UTC(year, 11, 31)),
  };
}

/**
 * The dates on which a calendar month worked in full has completed.
 *
 * Each returned date is the first of a month, and stands for the month before
 * it — 1 June means May was worked from its first day to its last, so May has
 * earned a period.
 *
 * The subtlety is the joiner. Somebody who starts on 15 May did not work May
 * in full, so their first earning month is June and their first credit lands
 * on 1 July. Counting from 1 June instead would hand them a full month's leave
 * for a fortnight, which is the kind of generosity nobody notices until it is
 * being deducted back out of a final payslip. When `from` is itself the first
 * of a month — which it is for the cycle start, and for every watermark this
 * function has written — no month is skipped.
 */
export function monthBoundariesBetween(from: Date, asOf: Date): Date[] {
  const startsMidMonth = from.getUTCDate() !== 1;
  const cursor = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + (startsMidMonth ? 2 : 1),
      1,
    ),
  );

  const boundaries: Date[] = [];
  while (cursor <= asOf) {
    boundaries.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return boundaries;
}

export interface AccrualInput {
  method: LeaveAccrualMethod;
  /** Days per completed month, for MONTHLY_ACCRUAL. */
  daysPerPeriod: number | null;
  /** The cycle's entitlement, and the ceiling accrual may not carry past. */
  daysPerCycle: number | null;
  cycle: LeaveCycle;
  /** The employee's first day. Accrual never starts before it. */
  startedAt: Date;
  /** Their last day, when they have one. Accrual stops there. */
  endedAt: Date | null;
  /** Entitlement already on the balance. */
  entitledDays: number;
  /** How far accrual has already credited, or null if it never has. */
  accruedThroughAt: Date | null;
  asOf: Date;
}

export interface AccrualOutcome {
  /** Days to add. Zero means there is nothing to write. */
  creditDays: number;
  /** The new watermark, or null when nothing moved. */
  accruedThroughAt: Date | null;
}

/**
 * What this balance has earned since it was last credited.
 *
 * Everything is derived from the watermark rather than from "now", so running
 * this twice in a day, or catching up six months late, both land on the same
 * number. That property is the whole reason the watermark is stored.
 */
export function accrualFor(input: AccrualInput): AccrualOutcome {
  const nothing: AccrualOutcome = { creditDays: 0, accruedThroughAt: null };
  if (input.method === "MANUAL") return nothing;

  // Accrual is bounded by the cycle at one end and the employment at the other.
  const start = laterOf(input.cycle.startsAt, input.startedAt);
  const end = earliestOf([input.cycle.endsAt, input.endedAt, input.asOf]);
  if (end < start) return nothing;

  const ceiling = input.daysPerCycle;
  const headroom = ceiling === null ? Infinity : ceiling - input.entitledDays;
  if (headroom <= 0) return nothing;

  if (input.method === "ANNUAL_GRANT") {
    // Granted once per cycle: the watermark is what says it has happened.
    if (input.accruedThroughAt !== null) return nothing;
    if (ceiling === null) return nothing;
    return { creditDays: round2(headroom), accruedThroughAt: start };
  }

  const perPeriod = input.daysPerPeriod ?? 0;
  if (perPeriod <= 0) return nothing;

  const from = input.accruedThroughAt ?? start;
  const boundaries = monthBoundariesBetween(from, end);
  if (boundaries.length === 0) return nothing;

  const earned = perPeriod * boundaries.length;
  return {
    creditDays: round2(Math.min(earned, headroom)),
    accruedThroughAt: boundaries[boundaries.length - 1],
  };
}

export interface CarryOverInput {
  /** Days the policy allows across the boundary. Null means none. */
  carryOverMaxDays: number | null;
  /** The closing balance of the cycle that just ended, if there was one. */
  previous: {
    entitledDays: number;
    broughtForwardDays: number;
    takenDays: number;
  } | null;
}

/**
 * What survives the end of a cycle.
 *
 * Unused days up to the policy limit, and not a day more. Two things this
 * deliberately does not do: it does not carry a negative balance forward,
 * because leave taken in advance is a payroll matter rather than a debt
 * against next year's entitlement; and it does not touch the cycle that ended,
 * whose closing figures stay exactly as they were so the year can still be
 * explained after the fact.
 *
 * The BCEA also says leave must be taken within six months of the cycle
 * closing. Expiring carried days on that clock needs a date this ledger does
 * not record yet, so it is not attempted here rather than half-done.
 */
export function carryOverFor(input: CarryOverInput): number {
  const cap = input.carryOverMaxDays;
  if (cap === null || cap <= 0 || !input.previous) return 0;

  const unused =
    input.previous.entitledDays +
    input.previous.broughtForwardDays -
    input.previous.takenDays;

  return round2(Math.min(Math.max(unused, 0), cap));
}

/** The cycle immediately before this one. */
export function previousCycle(cycle: LeaveCycle): LeaveCycle {
  const dayBefore = new Date(cycle.startsAt);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  return cycleFor(dayBefore);
}

/** Two decimals, because the column is Decimal(6,2) and 1.25 × 3 is not. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function laterOf(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function earliestOf(dates: Array<Date | null>): Date {
  const present = dates.filter((date): date is Date => date !== null);
  return present.reduce((earliest, date) => (date < earliest ? date : earliest));
}
