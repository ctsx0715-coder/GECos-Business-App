import { describe, expect, it } from "vitest";
import { accrualFor, cycleFor, monthBoundariesBetween } from "./leave-accrual";

/**
 * The accrual arithmetic, driven directly.
 *
 * No database, because none of this needs one, and a leave balance that is
 * quietly wrong is worth a hundred cheap assertions rather than three
 * expensive ones. The service test proves the wiring; this proves the numbers.
 */

const CYCLE = cycleFor(new Date("2026-06-15T00:00:00Z"));

function monthly(overrides: Partial<Parameters<typeof accrualFor>[0]> = {}) {
  return accrualFor({
    method: "MONTHLY_ACCRUAL",
    daysPerPeriod: 1.25,
    daysPerCycle: 15,
    cycle: CYCLE,
    startedAt: new Date("2020-01-01T00:00:00Z"),
    endedAt: null,
    entitledDays: 0,
    accruedThroughAt: null,
    asOf: new Date("2026-06-15T00:00:00Z"),
    ...overrides,
  });
}

describe("the leave cycle", () => {
  it("is the calendar year containing the date", () => {
    const cycle = cycleFor(new Date("2026-06-15T00:00:00Z"));
    expect(cycle.startsAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(cycle.endsAt.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});

describe("month boundaries", () => {
  it("counts a month once it has been worked in full", () => {
    // Started mid-March: March is partial, April is the first full month, and
    // April is earned on 1 May.
    const boundaries = monthBoundariesBetween(
      new Date("2026-03-15T00:00:00Z"),
      new Date("2026-05-20T00:00:00Z"),
    );
    expect(boundaries.map((date) => date.toISOString().slice(0, 10))).toEqual([
      "2026-05-01",
    ]);
  });

  it("skips no months when counting from the first", () => {
    const boundaries = monthBoundariesBetween(
      new Date("2026-03-01T00:00:00Z"),
      new Date("2026-05-20T00:00:00Z"),
    );
    expect(boundaries.map((date) => date.toISOString().slice(0, 10))).toEqual([
      "2026-04-01",
      "2026-05-01",
    ]);
  });

  it("returns nothing inside the first month", () => {
    expect(
      monthBoundariesBetween(
        new Date("2026-03-01T00:00:00Z"),
        new Date("2026-03-31T00:00:00Z"),
      ),
    ).toEqual([]);
  });
});

describe("monthly accrual", () => {
  it("credits a day and a quarter for each completed month", () => {
    // 1 January to 15 June: five completed months.
    const outcome = monthly();
    expect(outcome.creditDays).toBe(6.25);
    expect(outcome.accruedThroughAt?.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  it("is a no-op when run again the same day", () => {
    const first = monthly();
    const second = monthly({
      entitledDays: first.creditDays,
      accruedThroughAt: first.accruedThroughAt,
    });
    expect(second.creditDays).toBe(0);
  });

  it("catches up a run that was missed for three months", () => {
    const caughtUp = monthly({
      entitledDays: 2.5,
      accruedThroughAt: new Date("2026-03-01T00:00:00Z"),
    });
    // March, April and May completed since the watermark.
    expect(caughtUp.creditDays).toBe(3.75);
  });

  it("earns nothing for the month somebody joins part way through", () => {
    // Joined 15 May, run on 15 June: May was partial and June is not over, so
    // there is nothing yet. Their first credit lands on 1 July.
    expect(monthly({ startedAt: new Date("2026-05-15T00:00:00Z") }).creditDays).toBe(0);

    const july = monthly({
      startedAt: new Date("2026-05-15T00:00:00Z"),
      asOf: new Date("2026-07-01T00:00:00Z"),
    });
    expect(july.creditDays).toBe(1.25);
    expect(july.accruedThroughAt?.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("stops at the entitlement ceiling", () => {
    const outcome = monthly({
      entitledDays: 14.5,
      asOf: new Date("2026-12-31T00:00:00Z"),
    });
    expect(outcome.creditDays).toBe(0.5);
  });

  it("credits nothing once the ceiling is reached", () => {
    expect(monthly({ entitledDays: 15 }).creditDays).toBe(0);
  });

  it("stops accruing when somebody leaves", () => {
    const outcome = monthly({ endedAt: new Date("2026-03-20T00:00:00Z") });
    // January and February only — March was not worked in full.
    expect(outcome.creditDays).toBe(2.5);
  });

  it("has no ceiling when the type is uncapped", () => {
    const outcome = monthly({ daysPerCycle: null, entitledDays: 400 });
    expect(outcome.creditDays).toBe(6.25);
  });
});

describe("annual grant", () => {
  const grant = (overrides: Partial<Parameters<typeof accrualFor>[0]> = {}) =>
    accrualFor({
      method: "ANNUAL_GRANT",
      daysPerPeriod: null,
      daysPerCycle: 21,
      cycle: CYCLE,
      startedAt: new Date("2020-01-01T00:00:00Z"),
      endedAt: null,
      entitledDays: 0,
      accruedThroughAt: null,
      asOf: new Date("2026-06-15T00:00:00Z"),
      ...overrides,
    });

  it("grants the whole entitlement once", () => {
    const outcome = grant();
    expect(outcome.creditDays).toBe(21);
    expect(outcome.accruedThroughAt?.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("does not grant twice", () => {
    expect(
      grant({ entitledDays: 21, accruedThroughAt: new Date("2026-01-01") })
        .creditDays,
    ).toBe(0);
  });

  it("tops up to the entitlement when days were already written by hand", () => {
    expect(grant({ entitledDays: 5 }).creditDays).toBe(16);
  });

  it("grants from the first day for somebody who joins mid-cycle", () => {
    const outcome = grant({ startedAt: new Date("2026-04-01T00:00:00Z") });
    expect(outcome.creditDays).toBe(21);
    expect(outcome.accruedThroughAt?.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("grants nothing to somebody who starts after the cycle ends", () => {
    expect(grant({ startedAt: new Date("2027-02-01T00:00:00Z") }).creditDays).toBe(0);
  });
});

describe("manual types", () => {
  it("never accrue", () => {
    expect(monthly({ method: "MANUAL" }).creditDays).toBe(0);
  });

  it("and neither does a monthly type with no rate set", () => {
    expect(monthly({ daysPerPeriod: null }).creditDays).toBe(0);
  });
});
