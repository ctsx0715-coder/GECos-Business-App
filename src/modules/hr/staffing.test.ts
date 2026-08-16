import { describe, expect, it } from "vitest";
import {
  assess,
  describeRule,
  ruleAppliesOn,
  shortfall,
  surplus,
  weekVerdict,
  weekdayIndex,
} from "./staffing";

/**
 * Comparing a headcount to a rule.
 *
 * The cases worth pinning down are the asymmetries: a rule with no ceiling can
 * never be overstaffed, a week is judged by its worst day rather than its
 * average, and Monday is 0 here while JavaScript thinks Sunday is.
 */

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const CREW = { minimumPeople: 4, maximumPeople: 6, weekdays: [0, 1, 2, 3, 4] };
const OPEN = { minimumPeople: 2, maximumPeople: null, weekdays: [] };

describe("which days a rule speaks about", () => {
  it("counts Monday as 0, not Sunday", () => {
    // Monday 5 January 2026.
    expect(weekdayIndex(day("2026-01-05"))).toBe(0);
    expect(weekdayIndex(day("2026-01-11"))).toBe(6);
  });

  it("applies on the days it names", () => {
    expect(ruleAppliesOn(CREW, day("2026-01-07"))).toBe(true); // Wednesday
    expect(ruleAppliesOn(CREW, day("2026-01-10"))).toBe(false); // Saturday
  });

  it("applies every day when it names none", () => {
    expect(ruleAppliesOn(OPEN, day("2026-01-10"))).toBe(true);
    expect(ruleAppliesOn(OPEN, day("2026-01-11"))).toBe(true);
  });
});

describe("judging a day", () => {
  it("is short below the minimum", () => {
    expect(assess(CREW, 3)).toBe("SHORT");
    expect(shortfall(CREW, 3)).toBe(1);
  });

  it("is fine at the minimum", () => {
    expect(assess(CREW, 4)).toBe("OK");
    expect(shortfall(CREW, 4)).toBe(0);
  });

  it("is over above the maximum", () => {
    expect(assess(CREW, 8)).toBe("OVER");
    expect(surplus(CREW, 8)).toBe(2);
  });

  it("is never over when there is no ceiling", () => {
    // Too many hands is a cost, not a failure, and a rule that does not set a
    // ceiling should not invent one.
    expect(assess(OPEN, 40)).toBe("OK");
    expect(surplus(OPEN, 40)).toBe(0);
  });

  it("reports nobody at all as short rather than as nothing", () => {
    expect(assess(CREW, 0)).toBe("SHORT");
    expect(shortfall(CREW, 0)).toBe(4);
  });
});

describe("a rule in words", () => {
  it("reads as a range over a run of days", () => {
    expect(describeRule(CREW)).toBe("4–6 people, Mon–Fri");
  });

  it("says 'or more' when nothing caps it", () => {
    expect(describeRule(OPEN)).toBe("2 or more, any day");
  });

  it("says 'exactly' when the range is one number", () => {
    expect(
      describeRule({ minimumPeople: 2, maximumPeople: 2, weekdays: [5] }),
    ).toBe("exactly 2, Sat");
  });

  it("lists two separate days rather than pretending they are a run", () => {
    expect(
      describeRule({ minimumPeople: 1, maximumPeople: null, weekdays: [0, 3] }),
    ).toBe("1 or more, Mon, Thu");
  });
});

describe("judging a week", () => {
  it("takes its worst day", () => {
    // Four comfortable days do not staff the Wednesday nobody turned up for.
    expect(weekVerdict(["OK", "OK", "SHORT", "OK", "OVER"])).toBe("SHORT");
  });

  it("reports over only when nothing was short", () => {
    expect(weekVerdict(["OK", "OVER", "OK"])).toBe("OVER");
  });

  it("is fine when every day is", () => {
    expect(weekVerdict(["OK", "OK"])).toBe("OK");
  });
});
