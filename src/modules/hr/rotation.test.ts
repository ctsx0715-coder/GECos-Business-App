import { describe, expect, it } from "vitest";
import {
  consecutiveTurns,
  dayBefore,
  fairnessConcern,
  turnEndsOn,
  turnInForce,
} from "./rotation";

/**
 * Rotation arithmetic.
 *
 * The cases worth writing down are the ones a spreadsheet gets wrong: a turn
 * that ends the morning after it should, a run of nights broken by one week of
 * days and counted as though it never stopped, and a fairness rule that fires
 * on the office pattern and trains everybody to ignore it.
 */

const NIGHTS = "nights";
const DAYS = "days";

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe("the length of a turn", () => {
  it("ends on the last day worked, not the morning after", () => {
    // Four weeks from Monday 5 January 2026 ends on Sunday 1 February.
    expect(turnEndsOn(day("2026-01-05"), 4)).toEqual(day("2026-02-01"));
  });

  it("makes a one-week turn seven days, not eight", () => {
    expect(turnEndsOn(day("2026-01-05"), 1)).toEqual(day("2026-01-11"));
  });

  it("closes the previous turn the day before the next one opens", () => {
    expect(dayBefore(day("2026-02-02"))).toEqual(day("2026-02-01"));
  });

  it("counts across a month end without help", () => {
    expect(turnEndsOn(day("2026-02-23"), 2)).toEqual(day("2026-03-08"));
  });
});

describe("a run of turns on one pattern", () => {
  const history = [
    { workPatternId: NIGHTS, startsOn: day("2026-03-01") },
    { workPatternId: NIGHTS, startsOn: day("2026-02-01") },
    { workPatternId: DAYS, startsOn: day("2026-01-01") },
    { workPatternId: NIGHTS, startsOn: day("2025-12-01") },
  ];

  it("counts back from the most recent", () => {
    expect(consecutiveTurns(history, NIGHTS)).toBe(2);
  });

  it("is broken by a single turn on something else", () => {
    // Four nights in the history, but only two of them running. Somebody who
    // alternates is not the person the rule is looking for.
    expect(history.filter((turn) => turn.workPatternId === NIGHTS)).toHaveLength(3);
    expect(consecutiveTurns(history, NIGHTS)).toBe(2);
  });

  it("is zero when the most recent turn is a different pattern", () => {
    expect(consecutiveTurns(history, DAYS)).toBe(0);
  });

  it("is zero for somebody with no history at all", () => {
    expect(consecutiveTurns([], NIGHTS)).toBe(0);
  });
});

describe("the fairness watch", () => {
  const base = { employeeName: "Refilwe Mokoena", patternName: "Nights" };

  it("says nothing until the limit is reached", () => {
    expect(fairnessConcern({ ...base, turns: 2, limit: 3 })).toBeNull();
  });

  it("speaks up on the turn that reaches it", () => {
    const concern = fairnessConcern({ ...base, turns: 3, limit: 3 });
    expect(concern).toContain("Refilwe Mokoena");
    expect(concern).toContain("3 turns running");
  });

  it("keeps speaking up past it, rather than only once", () => {
    // The fourth in a row is worse than the third, and a warning that fires
    // once and then goes quiet reads as though the problem went away.
    expect(fairnessConcern({ ...base, turns: 5, limit: 3 })).toContain("5 turns");
  });

  it("exempts a pattern with no limit, which is what the office week is", () => {
    expect(
      fairnessConcern({
        employeeName: "Thabo Nkosi",
        patternName: "Office week",
        turns: 12,
        limit: null,
      }),
    ).toBeNull();
  });
});

describe("which turn is in force", () => {
  const standing = { startsOn: day("2025-01-01"), endsOn: null, id: "standing" };
  const cover = {
    startsOn: day("2026-02-01"),
    endsOn: day("2026-02-28"),
    id: "cover",
  };
  const history = [standing, cover];

  it("is the standing turn on an ordinary day", () => {
    expect(turnInForce(history, day("2026-01-15"))?.id).toBe("standing");
  });

  it("is the covering turn while it runs", () => {
    expect(turnInForce(history, day("2026-02-10"))?.id).toBe("cover");
  });

  it("goes back to the standing turn the day after cover ends", () => {
    expect(turnInForce(history, day("2026-03-01"))?.id).toBe("standing");
  });

  it("includes both ends of the covering turn", () => {
    expect(turnInForce(history, day("2026-02-01"))?.id).toBe("cover");
    expect(turnInForce(history, day("2026-02-28"))?.id).toBe("cover");
  });

  it("is nothing at all before anybody was given a pattern", () => {
    expect(turnInForce(history, day("2024-06-01"))).toBeNull();
  });
});
