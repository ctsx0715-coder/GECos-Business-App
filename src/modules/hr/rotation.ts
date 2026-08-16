/**
 * Rotation: whose turn it is on which pattern, and when it stops being fair.
 *
 * Assigning patterns one person at a time is fine until a foreman has to move
 * a crew of eighteen onto nights for a month. That is one decision about a
 * group, and it should cost one action — which is what the bulk assignment
 * screen does, and what everything here supports.
 *
 * The fairness rule is the reason the history exists. On a construction
 * payroll the unpopular turns are real: nights, the six-day week, the
 * fortnight away from home. Left to a spreadsheet they land on whoever is
 * easiest to ask, and the person who never complains draws them four months
 * running. The system can see that and say so.
 *
 * It only says so. Nothing here refuses an assignment, and that is deliberate:
 * a rule that blocks a foreman staffing tonight's shift does not produce
 * fairness, it produces a foreman who stops recording who is on nights. A
 * warning he has to read and then override is worth more than a wall he routes
 * around, because the warning leaves the truth in the database.
 *
 * No database in this file, so the arithmetic can be driven across a year of
 * rotations in a test without one.
 */

const DAY_MS = 86_400_000;

export interface TurnShape {
  workPatternId: string;
  startsOn: Date;
}

/** Midnight UTC on the same calendar day. Dates here are days, not moments. */
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date).getTime() + days * DAY_MS);
}

/** The day before a turn starts, which is when the one before it must end. */
export function dayBefore(date: Date): Date {
  return addDays(date, -1);
}

/**
 * The last day of a turn that starts on `startsOn` and runs `weeks` weeks.
 *
 * Inclusive of both ends: a one-week turn from Monday ends on the Sunday, not
 * on the following Monday. Every date in this system is a day somebody either
 * works or does not, and a range that ends the morning after is how rosters
 * end up double-booking a Monday.
 */
export function turnEndsOn(startsOn: Date, weeks: number): Date {
  return addDays(startsOn, weeks * 7 - 1);
}

/**
 * How many turns in a row, counting back from the most recent, are on the same
 * pattern.
 *
 * `history` is newest first. A gap of any other pattern breaks the run, which
 * is the whole point: somebody who alternates nights and days has a run of one
 * however many nights they have worked in total.
 */
export function consecutiveTurns(
  history: readonly TurnShape[],
  workPatternId: string,
): number {
  let run = 0;
  for (const turn of history) {
    if (turn.workPatternId !== workPatternId) break;
    run += 1;
  }
  return run;
}

export interface FairnessInput {
  /** Who it is about, as it should read in the sentence. */
  employeeName: string;
  patternName: string;
  /** Turns in a row including the one being assigned. */
  turns: number;
  /** Null exempts the pattern — the office week, typically. */
  limit: number | null;
}

/**
 * What to say about a run that has gone on too long, or null when there is
 * nothing to say.
 *
 * Phrased as an observation rather than an instruction. The person reading it
 * knows things the system does not — who has the ticket for the crane, who
 * asked for nights because of the shift allowance — and the message that gets
 * acted on is the one that respects that.
 */
export function fairnessConcern(input: FairnessInput): string | null {
  if (input.limit === null) return null;
  if (input.turns < input.limit) return null;

  return `${input.employeeName} has now had ${input.patternName} ${input.turns} turns running.`;
}

/**
 * The turn in force on a given day, from a person's history.
 *
 * Turns are stored as ranges rather than a row per day, so "which pattern was
 * she on in March" is a search rather than a lookup. Open-ended turns — the
 * standing pattern most of the payroll is on — have no end date and win from
 * their start date onwards.
 */
export function turnInForce<T extends { startsOn: Date; endsOn: Date | null }>(
  history: readonly T[],
  on: Date,
): T | null {
  const day = startOfUtcDay(on);
  const candidates = history.filter(
    (turn) =>
      startOfUtcDay(turn.startsOn) <= day &&
      (turn.endsOn === null || startOfUtcDay(turn.endsOn) >= day),
  );
  if (candidates.length === 0) return null;

  // The latest start wins, so a covering turn written over a standing one is
  // the answer rather than the standing one it interrupts.
  return candidates.reduce((latest, turn) =>
    turn.startsOn > latest.startsOn ? turn : latest,
  );
}
