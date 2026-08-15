import { describe, expect, it } from "vitest";
import {
  crossesMidnight,
  describeShift,
  formatMinutes,
  parseMinutes,
  spanMinutes,
  workedHours,
} from "./shifts";

/**
 * Shift arithmetic.
 *
 * The night shift is the case worth the tests: it ends before it starts, and
 * every naive subtraction produces a negative number of hours.
 */

const DAY = { startsAtMinutes: 7 * 60, endsAtMinutes: 16 * 60, breakMinutes: 60 };
const NIGHT = { startsAtMinutes: 18 * 60, endsAtMinutes: 6 * 60, breakMinutes: 60 };
const SAT = { startsAtMinutes: 7 * 60, endsAtMinutes: 13 * 60, breakMinutes: 0 };

describe("a shift that crosses midnight", () => {
  it("is recognised", () => {
    expect(crossesMidnight(NIGHT)).toBe(true);
    expect(crossesMidnight(DAY)).toBe(false);
  });

  it("is twelve hours long, not minus twelve", () => {
    expect(spanMinutes(NIGHT)).toBe(12 * 60);
    expect(workedHours(NIGHT)).toBe(11);
  });

  it("says so when described", () => {
    expect(describeShift(NIGHT)).toBe("18:00–06:00 (+1)");
    expect(describeShift(DAY)).toBe("07:00–16:00");
  });
});

describe("paid hours", () => {
  it("subtract the unpaid break", () => {
    expect(workedHours(DAY)).toBe(8);
    expect(workedHours(SAT)).toBe(6);
  });

  it("never go negative, however wrong the break", () => {
    expect(workedHours({ ...SAT, breakMinutes: 600 })).toBe(0);
  });
});

describe("reading and writing times", () => {
  it("round-trips", () => {
    expect(formatMinutes(420)).toBe("07:00");
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(23 * 60 + 45)).toBe("23:45");
    expect(parseMinutes("07:00")).toBe(420);
    expect(parseMinutes("23:45")).toBe(1425);
  });

  it("refuses nonsense rather than guessing", () => {
    expect(parseMinutes("25:00")).toBeNull();
    expect(parseMinutes("07:70")).toBeNull();
    expect(parseMinutes("seven")).toBeNull();
  });
});
