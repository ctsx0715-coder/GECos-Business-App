/**
 * Are we short on Tuesday?
 *
 * Everything else in Work cycles answers a question about one person: which
 * days they work, which shift, whose turn it is. This answers a question about
 * a day — how many people a site needs, and how many it is actually getting —
 * which is the question that decides whether somebody gets phoned on a Sunday
 * night.
 *
 * The rules are rows, not constants, because the number is a judgement that
 * changes weekly and the person who knows it is a site manager rather than
 * whoever deploys. What lives here is only the arithmetic of comparing a count
 * to a rule, kept away from the database so a week of coverage can be driven
 * in a test.
 */

export type Coverage = "SHORT" | "OVER" | "OK";

export interface RuleShape {
  minimumPeople: number;
  /** Null is no ceiling, which is the honest answer for most sites. */
  maximumPeople: number | null;
  /** 0 = Monday. Empty means every day. */
  weekdays: number[];
}

/** Monday is 0 here, unlike `Date.getUTCDay`, where Sunday is 0. */
export function weekdayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

/** Whether a rule has anything to say about a given day. */
export function ruleAppliesOn(rule: RuleShape, date: Date): boolean {
  if (rule.weekdays.length === 0) return true;
  return rule.weekdays.includes(weekdayIndex(date));
}

/**
 * How a day stands against a rule.
 *
 * Short and over are not symmetrical and should not be dressed as though they
 * were. Being short means work does not happen; being over means it costs more
 * than it needed to. The dashboard colours them differently for that reason,
 * and a rule with no ceiling can never be over at all.
 */
export function assess(rule: RuleShape, actual: number): Coverage {
  if (actual < rule.minimumPeople) return "SHORT";
  if (rule.maximumPeople !== null && actual > rule.maximumPeople) return "OVER";
  return "OK";
}

/** How many bodies short, or 0. The number a foreman actually needs. */
export function shortfall(rule: RuleShape, actual: number): number {
  return Math.max(0, rule.minimumPeople - actual);
}

/** How many more than wanted, or 0. */
export function surplus(rule: RuleShape, actual: number): number {
  if (rule.maximumPeople === null) return 0;
  return Math.max(0, actual - rule.maximumPeople);
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * A rule in words: "3–6 people, Mon–Fri".
 *
 * Written out rather than shown as fields, because a rule is read far more
 * often than it is edited and "minimumPeople 3, maximumPeople 6, weekdays
 * [0,1,2,3,4]" is not a sentence anybody checks at a glance.
 */
export function describeRule(rule: RuleShape): string {
  const people =
    rule.maximumPeople === null
      ? `${rule.minimumPeople} or more`
      : rule.minimumPeople === rule.maximumPeople
        ? `exactly ${rule.minimumPeople}`
        : `${rule.minimumPeople}–${rule.maximumPeople} people`;

  if (rule.weekdays.length === 0) return `${people}, any day`;

  const days = [...rule.weekdays].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const index of days) {
    const last = runs[runs.length - 1];
    if (last && index === last[last.length - 1] + 1) last.push(index);
    else runs.push([index]);
  }

  const written = runs
    .map((run) =>
      run.length > 2
        ? `${DAY_NAMES[run[0]]}–${DAY_NAMES[run[run.length - 1]]}`
        : run.map((index) => DAY_NAMES[index]).join(", "),
    )
    .join(", ");

  return `${people}, ${written}`;
}

/**
 * The week in one line: the worst thing that happens in it.
 *
 * A week is judged by its worst day rather than by an average, because five
 * comfortable days do not staff the Wednesday nobody turned up for.
 */
export function weekVerdict(days: Coverage[]): Coverage {
  if (days.includes("SHORT")) return "SHORT";
  if (days.includes("OVER")) return "OVER";
  return "OK";
}
