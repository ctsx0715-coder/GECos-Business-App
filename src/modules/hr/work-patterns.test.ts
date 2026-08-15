import { describe, expect, it } from "vitest";
import {
  DEFAULT_PATTERN,
  PATTERN_ANCHOR,
  cycleIndexOf,
  describePattern,
  workingDaysBetween,
  workingDaysIn,
  worksOn,
  type WorkPatternShape,
} from "./work-patterns";

/**
 * Working patterns, and the leave arithmetic that hangs off them.
 *
 * The cases that matter are the ones the old Monday-to-Friday assumption got
 * wrong: a six-day week, a fortnightly rotation, and a public holiday landing
 * on a day the person would not have worked anyway.
 */

const MON_FRI = DEFAULT_PATTERN;

const MON_SAT: WorkPatternShape = {
  cycleDays: 7,
  workingDayIndexes: [0, 1, 2, 3, 4, 5],
  anchorOn: PATTERN_ANCHOR,
};

/** Fourteen on, seven off — a rotation, anchored on a Monday. */
const ROTATION: WorkPatternShape = {
  cycleDays: 21,
  workingDayIndexes: Array.from({ length: 14 }, (_, index) => index),
  anchorOn: PATTERN_ANCHOR,
};

describe("where a date falls in the cycle", () => {
  it("puts Monday at index 0 for a week anchored on a Monday", () => {
    // 1 June 2026 is a Monday.
    expect(cycleIndexOf(MON_FRI, new Date("2026-06-01"))).toBe(0);
    expect(cycleIndexOf(MON_FRI, new Date("2026-06-06"))).toBe(5); // Saturday
    expect(cycleIndexOf(MON_FRI, new Date("2026-06-07"))).toBe(6); // Sunday
  });

  it("handles dates before the anchor", () => {
    // 25 December 2023 is a Monday, a week before the anchor. A negative
    // remainder would match nothing and quietly give somebody the day off.
    expect(cycleIndexOf(MON_FRI, new Date("2023-12-25"))).toBe(0);
    expect(worksOn(MON_FRI, new Date("2023-12-25"))).toBe(true);
  });
});

describe("who works when", () => {
  it("gives a Monday-to-Friday week its weekend", () => {
    expect(worksOn(MON_FRI, new Date("2026-06-05"))).toBe(true); // Friday
    expect(worksOn(MON_FRI, new Date("2026-06-06"))).toBe(false); // Saturday
  });

  it("has a six-day week working Saturday", () => {
    expect(worksOn(MON_SAT, new Date("2026-06-06"))).toBe(true);
    expect(worksOn(MON_SAT, new Date("2026-06-07"))).toBe(false); // Sunday
  });

  it("takes a rotation off in its third week", () => {
    // Anchored on Monday 1 January 2024: the first fourteen days are worked.
    expect(worksOn(ROTATION, new Date("2024-01-01"))).toBe(true);
    expect(worksOn(ROTATION, new Date("2024-01-14"))).toBe(true);
    expect(worksOn(ROTATION, new Date("2024-01-15"))).toBe(false);
    expect(worksOn(ROTATION, new Date("2024-01-21"))).toBe(false);
    // And the cycle begins again.
    expect(worksOn(ROTATION, new Date("2024-01-22"))).toBe(true);
  });
});

describe("counting working days", () => {
  it("excludes weekends for a Monday-to-Friday week", () => {
    // Monday 1 June 2026 to Friday 5 June: five days.
    expect(workingDaysBetween(new Date("2026-06-01"), new Date("2026-06-05"))).toBe(5);
    // Spanning a weekend adds calendar days but not working days.
    expect(workingDaysBetween(new Date("2026-06-01"), new Date("2026-06-08"))).toBe(6);
  });

  it("charges a six-day week for its Saturday", () => {
    // The same week costs one more day to somebody who works Saturdays.
    const week: [Date, Date] = [new Date("2026-06-01"), new Date("2026-06-07")];
    expect(workingDaysBetween(...week, new Set(), MON_FRI)).toBe(5);
    expect(workingDaysBetween(...week, new Set(), MON_SAT)).toBe(6);
  });

  it("excludes a public holiday inside the range", () => {
    // Youth Day, Tuesday 16 June 2026.
    const holidays = new Set(["2026-06-16"]);
    expect(
      workingDaysBetween(new Date("2026-06-15"), new Date("2026-06-19"), holidays),
    ).toBe(4);
  });

  it("ignores a holiday on a day the person does not work anyway", () => {
    // A holiday on the Saturday costs a Monday-to-Friday week nothing, and
    // costs a six-day week a day.
    const holidays = new Set(["2026-06-20"]);
    const week: [Date, Date] = [new Date("2026-06-15"), new Date("2026-06-20")];
    expect(workingDaysBetween(...week, holidays, MON_FRI)).toBe(5);
    expect(workingDaysBetween(...week, holidays, MON_SAT)).toBe(5);
  });

  it("counts nothing across a rotation's week off", () => {
    // 15 to 21 January 2024 is the off week.
    expect(
      workingDaysBetween(
        new Date("2024-01-15"),
        new Date("2024-01-21"),
        new Set(),
        ROTATION,
      ),
    ).toBe(0);
  });

  it("counts a single day as one, and a rest day as none", () => {
    expect(workingDaysBetween(new Date("2026-06-03"), new Date("2026-06-03"))).toBe(1);
    expect(workingDaysBetween(new Date("2026-06-06"), new Date("2026-06-07"))).toBe(0);
  });

  it("returns the days themselves for the roster", () => {
    expect(
      workingDaysIn(new Date("2026-06-15"), new Date("2026-06-21"), new Set(["2026-06-16"])),
    ).toEqual(["2026-06-15", "2026-06-17", "2026-06-18", "2026-06-19"]);
  });
});

describe("describing a pattern", () => {
  it("names the days of a weekly pattern", () => {
    expect(describePattern(MON_FRI)).toBe("Mon–Fri");
    expect(describePattern(MON_SAT)).toBe("Mon–Sat");
    expect(
      describePattern({ ...MON_FRI, workingDayIndexes: [0, 2, 4] }),
    ).toBe("Mon, Wed, Fri");
    expect(
      describePattern({ ...MON_FRI, workingDayIndexes: [1, 2, 3, 4, 5] }),
    ).toBe("Tue–Sat");
  });

  it("describes a longer cycle by its shape", () => {
    expect(describePattern(ROTATION)).toBe("14 days on, 7 off (21-day cycle)");
  });
});
