/**
 * Splitting worked hours into the categories payroll pays at different rates.
 *
 * The timesheet says somebody worked eleven hours on a Sunday. Payroll needs
 * that as ordinary, overtime, Sunday and public-holiday hours, because each is
 * worth a different multiple. That split is the whole of this module, and it
 * is kept away from the database so a fortnight of it can be driven in a test.
 *
 * What this deliberately does not do is work out what anybody is paid. No pay
 * rate is stored anywhere in the system: the export carries hours and the
 * multipliers the tenant has configured, and the payroll package holds the
 * rates and does the multiplication. That keeps salaries out of a database
 * that has not yet cleared the RLS and MFA gate, and it is how every South
 * African payroll package expects to be fed anyway.
 *
 * The numbers are the BCEA's as defaults, and rows as far as the code is
 * concerned. A bargaining council agreement raises any of them without a
 * deployment.
 */

export interface PayrollPolicyShape {
  ordinaryMinutesPerDayShortWeek: number;
  ordinaryMinutesPerDayLongWeek: number;
  ordinaryMinutesPerWeek: number;
  maxOvertimeMinutesPerDay: number;
  maxOvertimeMinutesPerWeek: number;
}

export const BCEA_POLICY: PayrollPolicyShape = {
  // Nine hours a day on a five-day week, eight on six, 45 in the week.
  ordinaryMinutesPerDayShortWeek: 9 * 60,
  ordinaryMinutesPerDayLongWeek: 8 * 60,
  ordinaryMinutesPerWeek: 45 * 60,
  maxOvertimeMinutesPerDay: 3 * 60,
  maxOvertimeMinutesPerWeek: 10 * 60,
};

export interface WorkedDay {
  /** ISO date of the working day, which for a night shift is the day it began. */
  date: string;
  minutes: number;
  isPublicHoliday: boolean;
}

export interface DaySplit {
  date: string;
  ordinary: number;
  overtime: number;
  sunday: number;
  holiday: number;
}

/**
 * The ordinary day length for somebody, from how many days a week they work.
 *
 * The BCEA gives nine hours to a five-day week and eight to anything longer,
 * on the reasoning that the weekly total is what is really capped. Reading it
 * off the person's pattern means a six-day site worker starts earning overtime
 * an hour earlier than the office does, which is the law rather than a
 * generosity.
 */
export function ordinaryMinutesPerDay(
  policy: PayrollPolicyShape,
  workingDaysPerWeek: number,
): number {
  return workingDaysPerWeek > 5
    ? policy.ordinaryMinutesPerDayLongWeek
    : policy.ordinaryMinutesPerDayShortWeek;
}

function isSunday(date: string): boolean {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;
}

/**
 * One day, split.
 *
 * Precedence, and it matters: a public holiday is all holiday hours, a Sunday
 * is all Sunday hours, and everything else splits at the ordinary day length.
 * Charging a Sunday's first eight hours as ordinary and the rest as overtime
 * would pay somebody less for working a Sunday than the BCEA requires, which
 * is the kind of arithmetic error that only surfaces in a CCMA hearing.
 */
export function splitDay(
  day: WorkedDay,
  ordinaryPerDay: number,
): DaySplit {
  const base = { date: day.date, ordinary: 0, overtime: 0, sunday: 0, holiday: 0 };

  if (day.minutes <= 0) return base;
  if (day.isPublicHoliday) return { ...base, holiday: day.minutes };
  if (isSunday(day.date)) return { ...base, sunday: day.minutes };

  return {
    ...base,
    ordinary: Math.min(day.minutes, ordinaryPerDay),
    overtime: Math.max(0, day.minutes - ordinaryPerDay),
  };
}

export interface WeekSplit {
  days: DaySplit[];
  ordinary: number;
  overtime: number;
  sunday: number;
  holiday: number;
  /** Everything worked, whatever it is worth. */
  total: number;
}

/**
 * A week, split, with the weekly ceiling applied after the daily one.
 *
 * Somebody can stay under nine hours every day and still pass 45 in the week —
 * six eight-hour days is 48 — so the weekly cap has to be applied to the
 * ordinary total afterwards, moving the excess into overtime. Doing it the
 * other way round double-counts the same hour.
 */
export function splitWeek(
  days: WorkedDay[],
  policy: PayrollPolicyShape,
  workingDaysPerWeek: number,
): WeekSplit {
  const perDay = ordinaryMinutesPerDay(policy, workingDaysPerWeek);
  const split = days.map((day) => splitDay(day, perDay));

  const ordinaryBeforeCap = split.reduce((sum, day) => sum + day.ordinary, 0);
  const overCap = Math.max(0, ordinaryBeforeCap - policy.ordinaryMinutesPerWeek);

  return {
    days: split,
    ordinary: ordinaryBeforeCap - overCap,
    overtime: split.reduce((sum, day) => sum + day.overtime, 0) + overCap,
    sunday: split.reduce((sum, day) => sum + day.sunday, 0),
    holiday: split.reduce((sum, day) => sum + day.holiday, 0),
    total: days.reduce((sum, day) => sum + day.minutes, 0),
  };
}

export interface Breach {
  kind: "DAILY_OVERTIME" | "WEEKLY_OVERTIME";
  date?: string;
  minutes: number;
  limit: number;
}

/**
 * Where a week went past what the BCEA allows.
 *
 * Reported, never enforced. The hours were worked and payroll still has to pay
 * them — refusing to export them would leave somebody unpaid for time they
 * actually stood on a site, which is a worse breach than the one being
 * flagged. The point of saying it is that somebody schedules differently next
 * week.
 */
export function breaches(
  week: WeekSplit,
  policy: PayrollPolicyShape,
): Breach[] {
  const found: Breach[] = [];

  for (const day of week.days) {
    if (day.overtime > policy.maxOvertimeMinutesPerDay) {
      found.push({
        kind: "DAILY_OVERTIME",
        date: day.date,
        minutes: day.overtime,
        limit: policy.maxOvertimeMinutesPerDay,
      });
    }
  }

  if (week.overtime > policy.maxOvertimeMinutesPerWeek) {
    found.push({
      kind: "WEEKLY_OVERTIME",
      minutes: week.overtime,
      limit: policy.maxOvertimeMinutesPerWeek,
    });
  }

  return found;
}

/** Minutes as decimal hours, which is what payroll packages take. 510 → 8.5. */
export function asHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * The Monday of the week a day falls in, as an ISO date.
 *
 * The weekly cap needs weeks, and a pay period is rarely a whole number of
 * them — a calendar month starts on a Wednesday. Grouping by the Monday means
 * a period boundary splits a week's cap across two exports, which is what
 * every payroll package does too.
 */
export function weekStarting(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** Groups days into the weeks the cap is applied over. */
export function byWeek(days: WorkedDay[]): Map<string, WorkedDay[]> {
  const weeks = new Map<string, WorkedDay[]>();
  for (const day of days) {
    const key = weekStarting(day.date);
    weeks.set(key, [...(weeks.get(key) ?? []), day]);
  }
  return weeks;
}
