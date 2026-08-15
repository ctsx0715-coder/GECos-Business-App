/**
 * South African public holidays, computed rather than typed in.
 *
 * Ten of the twelve sit on fixed dates. Two do not: Good Friday and Family Day
 * hang off Easter, which moves by up to a month, so a hand-typed list is a
 * list that is wrong from January of whichever year nobody remembered to
 * update it. The calculation is here, the result is rows, and a company
 * shutdown or a presidential proclamation is added alongside them as data.
 *
 * The Public Holidays Act, section 2(1): "whenever any public holiday falls on
 * a Sunday, the following Monday shall be a public holiday". That rule is
 * applied here, so what comes out is the day nobody comes to work rather than
 * the day the calendar names — which is the only version a leave calculation
 * can use.
 *
 * Not handled, deliberately: holidays proclaimed for one year only, such as an
 * election day. Nobody can compute those, and pretending otherwise would be
 * worse than the screen that lets somebody add one.
 */

export interface HolidaySpec {
  /** The day nobody works, after the Sunday rule has been applied. */
  observedOn: Date;
  name: string;
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 *
 * Reproduced rather than reasoned about: it is a closed-form arithmetic
 * recipe, correct for any Gregorian year, and the test pins it against a
 * decade of published dates because "it looks right" is not something anyone
 * can say about this function by reading it.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

function addDays(date: Date, days: number): Date {
  const moved = new Date(date);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved;
}

/** Section 2(1): a holiday on a Sunday is observed on the Monday. */
function observed(date: Date): Date {
  return date.getUTCDay() === 0 ? addDays(date, 1) : date;
}

/**
 * The statutory holidays for one year, as observed.
 *
 * Christmas and the Day of Goodwill are the pair that makes the Sunday rule
 * matter: when the 25th falls on a Sunday, the 26th is already a holiday, so
 * the Monday carries both and the year has one fewer day off. Returning them
 * as separate entries on the same date would double-count a leave day, so the
 * names are merged instead.
 */
export function statutoryHolidays(year: number): HolidaySpec[] {
  const easter = easterSunday(year);

  const fixed: Array<[number, number, string]> = [
    [1, 1, "New Year's Day"],
    [3, 21, "Human Rights Day"],
    [4, 27, "Freedom Day"],
    [5, 1, "Workers' Day"],
    [6, 16, "Youth Day"],
    [8, 9, "National Women's Day"],
    [9, 24, "Heritage Day"],
    [12, 16, "Day of Reconciliation"],
    [12, 25, "Christmas Day"],
    [12, 26, "Day of Goodwill"],
  ];

  const all: HolidaySpec[] = [
    // Good Friday and Family Day can never fall on a Sunday, so the rule does
    // not apply to them and is not applied.
    { observedOn: addDays(easter, -2), name: "Good Friday" },
    { observedOn: addDays(easter, 1), name: "Family Day" },
    ...fixed.map(([month, day, name]) => ({
      observedOn: observed(utc(year, month, day)),
      name,
    })),
  ];

  const byDate = new Map<string, HolidaySpec>();
  for (const holiday of all.sort(
    (a, b) => a.observedOn.getTime() - b.observedOn.getTime(),
  )) {
    const key = isoDate(holiday.observedOn);
    const existing = byDate.get(key);
    if (existing) {
      existing.name = `${existing.name} and ${holiday.name}`;
      continue;
    }
    byDate.set(key, { ...holiday });
  }

  return [...byDate.values()];
}

/** YYYY-MM-DD, the form used to compare days without comparing clocks. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
