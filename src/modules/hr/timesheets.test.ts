import { describe, expect, it } from "vitest";
import {
  describeDuration,
  describeMoment,
  looksUnclosed,
  minutesSoFar,
  minutesWorked,
  overlaps,
  overtimeAgainst,
  undertimeAgainst,
  workingDayOf,
} from "./timesheets";

/**
 * Timesheet arithmetic.
 *
 * The night shift is the case that breaks naive versions twice over: it ends
 * on the following calendar day, and the day it belongs to is the day it
 * started. Get the second one wrong and half a payroll lands in the wrong week.
 */

function at(iso: string): Date {
  return new Date(`${iso}Z`);
}

const DAY_SHIFT = { startsAtMinutes: 7 * 60, endsAtMinutes: 16 * 60, breakMinutes: 60 };
const NIGHT_SHIFT = { startsAtMinutes: 18 * 60, endsAtMinutes: 6 * 60, breakMinutes: 60 };

describe("the day a stretch of work belongs to", () => {
  it("is the day it started, even when it ends on the next one", () => {
    // Clocked in 18:00 Tuesday, out 06:00 Wednesday. That is Tuesday's work.
    expect(workingDayOf(at("2026-01-06T18:00:00"))).toEqual(
      new Date("2026-01-06T00:00:00.000Z"),
    );
  });

  it("is the same day for an ordinary morning start", () => {
    expect(workingDayOf(at("2026-01-06T07:04:00"))).toEqual(
      new Date("2026-01-06T00:00:00.000Z"),
    );
  });
});

describe("how long was worked", () => {
  it("subtracts the unpaid break", () => {
    const entry = {
      clockedInAt: at("2026-01-06T07:00:00"),
      clockedOutAt: at("2026-01-06T16:00:00"),
      breakMinutes: 60,
    };
    expect(minutesWorked(entry)).toBe(8 * 60);
  });

  it("counts a night shift as twelve hours, not minus twelve", () => {
    const entry = {
      clockedInAt: at("2026-01-06T18:00:00"),
      clockedOutAt: at("2026-01-07T06:00:00"),
      breakMinutes: 60,
    };
    expect(minutesWorked(entry)).toBe(11 * 60);
  });

  it("is zero while somebody is still on the clock", () => {
    const entry = {
      clockedInAt: at("2026-01-06T07:00:00"),
      clockedOutAt: null,
      breakMinutes: 0,
    };
    expect(minutesWorked(entry)).toBe(0);
    expect(minutesSoFar(entry, at("2026-01-06T09:30:00"))).toBe(150);
  });

  it("never goes negative when the break is longer than the stretch", () => {
    const entry = {
      clockedInAt: at("2026-01-06T07:00:00"),
      clockedOutAt: at("2026-01-06T07:20:00"),
      breakMinutes: 60,
    };
    expect(minutesWorked(entry)).toBe(0);
  });
});

describe("an entry nobody closed", () => {
  it("is flagged once it has run longer than anybody works", () => {
    const entry = {
      clockedInAt: at("2026-01-06T07:00:00"),
      clockedOutAt: null,
      breakMinutes: 0,
    };
    expect(looksUnclosed(entry, at("2026-01-06T15:00:00"))).toBe(false);
    expect(looksUnclosed(entry, at("2026-01-07T08:00:00"))).toBe(true);
  });

  it("leaves a long but plausible night shift alone", () => {
    const entry = {
      clockedInAt: at("2026-01-06T18:00:00"),
      clockedOutAt: at("2026-01-07T06:00:00"),
      breakMinutes: 60,
    };
    expect(looksUnclosed(entry)).toBe(false);
  });
});

describe("against the shift that was planned", () => {
  const short = {
    clockedInAt: at("2026-01-06T07:00:00"),
    clockedOutAt: at("2026-01-06T14:00:00"),
    breakMinutes: 60,
  };
  const long = {
    clockedInAt: at("2026-01-06T07:00:00"),
    clockedOutAt: at("2026-01-06T18:30:00"),
    breakMinutes: 60,
  };

  it("reports the overtime", () => {
    expect(overtimeAgainst(long, DAY_SHIFT)).toBe(150);
    expect(undertimeAgainst(long, DAY_SHIFT)).toBe(0);
  });

  it("reports the shortfall", () => {
    expect(undertimeAgainst(short, DAY_SHIFT)).toBe(120);
    expect(overtimeAgainst(short, DAY_SHIFT)).toBe(0);
  });

  it("says nothing when no shift was planned", () => {
    // An office week with no shift set has no expected length, and inventing
    // eight hours to compare against would manufacture overtime.
    expect(overtimeAgainst(long, null)).toBe(0);
    expect(undertimeAgainst(short, null)).toBe(0);
  });

  it("measures a night shift against a night shift", () => {
    const night = {
      clockedInAt: at("2026-01-06T18:00:00"),
      clockedOutAt: at("2026-01-07T07:30:00"),
      breakMinutes: 60,
    };
    expect(overtimeAgainst(night, NIGHT_SHIFT)).toBe(90);
  });
});

describe("two stretches at once", () => {
  const morning = {
    clockedInAt: at("2026-01-06T07:00:00"),
    clockedOutAt: at("2026-01-06T12:00:00"),
    breakMinutes: 0,
  };

  it("are recognised when they overlap", () => {
    const overlapping = {
      clockedInAt: at("2026-01-06T11:00:00"),
      clockedOutAt: at("2026-01-06T15:00:00"),
      breakMinutes: 0,
    };
    expect(overlaps(morning, overlapping)).toBe(true);
  });

  it("are fine when one ends before the other starts", () => {
    const afternoon = {
      clockedInAt: at("2026-01-06T12:00:00"),
      clockedOutAt: at("2026-01-06T17:00:00"),
      breakMinutes: 0,
    };
    expect(overlaps(morning, afternoon)).toBe(false);
  });

  it("treats an open entry as running until now", () => {
    const stillOn = {
      clockedInAt: at("2026-01-06T06:00:00"),
      clockedOutAt: null,
      breakMinutes: 0,
    };
    expect(overlaps(stillOn, morning, at("2026-01-06T13:00:00"))).toBe(true);
  });
});

describe("reading it back", () => {
  it("writes hours the way somebody says them", () => {
    expect(describeDuration(510)).toBe("8h 30m");
    expect(describeDuration(480)).toBe("8h");
    expect(describeDuration(45)).toBe("45m");
    expect(describeDuration(0)).toBe("—");
  });

  it("writes a moment as a clock reads it", () => {
    expect(describeMoment(at("2026-01-06T07:04:00"))).toBe("07:04");
    expect(describeMoment(at("2026-01-06T18:00:00"))).toBe("18:00");
  });
});
