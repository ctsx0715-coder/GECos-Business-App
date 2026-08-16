import { describe, expect, it } from "vitest";
import {
  asHours,
  BCEA_POLICY,
  breaches,
  byWeek,
  ordinaryMinutesPerDay,
  splitDay,
  splitWeek,
  weekStarting,
} from "./payroll";

/**
 * Splitting hours the way payroll pays them.
 *
 * The cases worth pinning down are the ones that cost somebody money: a Sunday
 * charged as an ordinary day plus overtime, a six-day week that never breaks
 * nine hours in a day and still passes forty-five in the week, and a breach
 * that stops the export instead of being reported.
 */

const MON = "2026-01-05";
const TUE = "2026-01-06";
const SAT = "2026-01-10";
const SUN = "2026-01-11";

function day(date: string, hours: number, isPublicHoliday = false) {
  return { date, minutes: Math.round(hours * 60), isPublicHoliday };
}

describe("the ordinary length of a day", () => {
  it("is nine hours on a five-day week", () => {
    expect(ordinaryMinutesPerDay(BCEA_POLICY, 5)).toBe(540);
  });

  it("is eight on a six-day week", () => {
    // The BCEA shortens the day when the week is longer — the weekly total is
    // what is really capped, so a site worker earns overtime an hour earlier.
    expect(ordinaryMinutesPerDay(BCEA_POLICY, 6)).toBe(480);
  });
});

describe("one day", () => {
  it("splits at the ordinary length", () => {
    expect(splitDay(day(MON, 11), 540)).toEqual({
      date: MON,
      ordinary: 540,
      overtime: 120,
      sunday: 0,
      holiday: 0,
    });
  });

  it("is all ordinary when it is short", () => {
    const split = splitDay(day(MON, 7), 540);
    expect(split.ordinary).toBe(420);
    expect(split.overtime).toBe(0);
  });

  it("puts a whole Sunday in the Sunday column", () => {
    // Not eight ordinary and three overtime: a Sunday is worth double from the
    // first minute, and splitting it would underpay the day.
    expect(splitDay(day(SUN, 11), 540)).toEqual({
      date: SUN,
      ordinary: 0,
      overtime: 0,
      sunday: 660,
      holiday: 0,
    });
  });

  it("puts a whole public holiday in the holiday column, even on a weekday", () => {
    const split = splitDay(day(TUE, 8, true), 540);
    expect(split.holiday).toBe(480);
    expect(split.ordinary).toBe(0);
  });

  it("counts a public holiday that falls on a Sunday once", () => {
    const split = splitDay(day(SUN, 8, true), 540);
    expect(split.holiday).toBe(480);
    expect(split.sunday).toBe(0);
  });

  it("is nothing at all for a day nobody worked", () => {
    expect(splitDay(day(MON, 0), 540).ordinary).toBe(0);
  });
});

describe("a week", () => {
  it("adds the days up", () => {
    const week = splitWeek(
      [day(MON, 9), day(TUE, 10)],
      BCEA_POLICY,
      5,
    );
    expect(week.ordinary).toBe(18 * 60);
    expect(week.overtime).toBe(60);
    expect(week.total).toBe(19 * 60);
  });

  it("moves hours past forty-five into overtime even when no day was long", () => {
    // Six eight-hour days is 48 hours and not one of them broke the daily
    // ceiling. Applying only the daily rule would pay three hours short.
    const week = splitWeek(
      [MON, TUE, "2026-01-07", "2026-01-08", "2026-01-09", SAT].map((date) =>
        day(date, 8),
      ),
      BCEA_POLICY,
      6,
    );
    expect(week.ordinary).toBe(45 * 60);
    expect(week.overtime).toBe(3 * 60);
    expect(week.total).toBe(48 * 60);
  });

  it("does not count Sunday or holiday hours against the ordinary ceiling", () => {
    const week = splitWeek(
      [day(MON, 9), day(TUE, 9), day(SUN, 8)],
      BCEA_POLICY,
      5,
    );
    expect(week.ordinary).toBe(18 * 60);
    expect(week.sunday).toBe(8 * 60);
    expect(week.overtime).toBe(0);
  });

  it("keeps the total equal to what was worked, however it is split", () => {
    const week = splitWeek(
      [day(MON, 12), day(SAT, 6), day(SUN, 5), day(TUE, 8, true)],
      BCEA_POLICY,
      6,
    );
    expect(week.ordinary + week.overtime + week.sunday + week.holiday).toBe(
      week.total,
    );
  });
});

describe("what the BCEA does not allow", () => {
  it("reports a day with more than three hours of overtime", () => {
    const week = splitWeek([day(MON, 13)], BCEA_POLICY, 5);
    const found = breaches(week, BCEA_POLICY);

    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("DAILY_OVERTIME");
    expect(found[0].date).toBe(MON);
  });

  it("reports a week with more than ten hours of overtime", () => {
    const week = splitWeek(
      [MON, TUE, "2026-01-07", "2026-01-08"].map((date) => day(date, 12)),
      BCEA_POLICY,
      5,
    );
    const found = breaches(week, BCEA_POLICY);
    expect(found.some((breach) => breach.kind === "WEEKLY_OVERTIME")).toBe(true);
  });

  it("still counts the hours it complains about", () => {
    // The hours were worked and payroll has to pay them. Withholding them
    // would be a worse breach than the one being reported.
    const week = splitWeek([day(MON, 13)], BCEA_POLICY, 5);
    expect(week.total).toBe(13 * 60);
    expect(week.ordinary + week.overtime).toBe(13 * 60);
  });

  it("says nothing about an ordinary week", () => {
    const week = splitWeek([day(MON, 9), day(TUE, 9)], BCEA_POLICY, 5);
    expect(breaches(week, BCEA_POLICY)).toHaveLength(0);
  });
});

describe("grouping a period into weeks", () => {
  it("puts a week under its Monday", () => {
    expect(weekStarting(SAT)).toBe(MON);
    expect(weekStarting(SUN)).toBe(MON);
    expect(weekStarting(MON)).toBe(MON);
  });

  it("splits a period that straddles a Monday into two weeks", () => {
    // A month rarely starts on a Monday, and the weekly ceiling belongs to the
    // week rather than the pay period.
    const weeks = byWeek([day(SUN, 8), day("2026-01-12", 8)]);
    expect([...weeks.keys()]).toEqual(["2026-01-05", "2026-01-12"]);
  });
});

describe("handing it to a payroll package", () => {
  it("gives decimal hours rather than minutes", () => {
    expect(asHours(510)).toBe(8.5);
    expect(asHours(480)).toBe(8);
    expect(asHours(0)).toBe(0);
  });
});
