import { describe, expect, it } from "vitest";
import {
  daysSince,
  frequencyRate,
  hardControlShare,
  lastLostTime,
  MEANINGFUL_HOURS,
  RATE_BASE_HOURS,
  recordableInjuries,
  safetyRecord,
  type CountableIncident,
} from "./safety-metrics";

/**
 * The safety numbers.
 *
 * The arithmetic is a division, so most of what is worth testing is what the
 * division must not be allowed to say: nothing about a site with no hours on
 * it, nothing about a company with no actions, and never a bare rate without
 * the figure that shows how little it takes to move it.
 */

const MARCH = new Date("2026-03-10T06:00:00.000Z");
const JUNE = new Date("2026-06-10T06:00:00.000Z");

function incident(
  kind: CountableIncident["kind"],
  overrides: Partial<CountableIncident> = {},
): CountableIncident {
  return { kind, occurredAt: MARCH, daysUnableToWork: null, ...overrides };
}

describe("the rate", () => {
  it("is injuries per two hundred thousand hours", () => {
    // One injury in exactly the base number of hours is, by definition, 1.0.
    expect(frequencyRate(1, RATE_BASE_HOURS)).toBe(1);
    expect(frequencyRate(3, RATE_BASE_HOURS)).toBe(3);
  });

  it("scales up from a small contractor's hours", () => {
    // 50 000 hours is roughly twenty-five people for a year.
    expect(frequencyRate(1, 50_000)).toBe(4);
  });

  it("says nothing at all when nobody has worked any hours", () => {
    // Not zero. A site that has not started has not earned a clean record.
    expect(frequencyRate(0, 0)).toBeNull();
    expect(frequencyRate(2, 0)).toBeNull();
  });
});

describe("what counts", () => {
  const mixed = [
    incident("NEAR_MISS"),
    incident("PROPERTY_DAMAGE"),
    incident("FIRST_AID"),
    incident("MEDICAL_TREATMENT"),
    incident("LOST_TIME", { daysUnableToWork: 4 }),
    incident("FATALITY"),
  ];

  it("counts lost time as time off, disability and death", () => {
    const record = safetyRecord({ incidents: mixed, minutesWorked: 0 });
    expect(record.lostTimeCount).toBe(2);
  });

  it("counts a doctor's visit as recordable but not a plaster", () => {
    expect(recordableInjuries(mixed)).toHaveLength(3);
  });

  it("leaves near misses and bent bakkies out of both", () => {
    const record = safetyRecord({ incidents: mixed, minutesWorked: 0 });
    expect(record.recordableCount).toBe(3);
  });
});

describe("the sensitivity, which is shown next to the rate", () => {
  it("says what one more injury would do to it", () => {
    // 60 000 hours: one injury reads 3.3, two read 6.7. A board told only the
    // first number will hear a company that got twice as dangerous.
    const record = safetyRecord({
      incidents: [incident("LOST_TIME", { daysUnableToWork: 10 })],
      minutesWorked: 60_000 * 60,
    });

    expect(record.lostTimeRate).toBe(3.3);
    expect(record.lostTimeRateWithOneMore).toBe(6.7);
  });

  it("still gives it for a company that has had none", () => {
    const record = safetyRecord({
      incidents: [incident("NEAR_MISS")],
      minutesWorked: 200_000 * 60,
    });

    expect(record.lostTimeRate).toBe(0);
    expect(record.lostTimeRateWithOneMore).toBe(1);
  });
});

describe("whether the rate can be compared to anybody", () => {
  it("says no on a fortnight of timesheets", () => {
    // The failure this exists for: two injuries against 694 hours is a rate of
    // 576, which is a true division and a false statement about the company.
    const record = safetyRecord({
      incidents: [
        incident("LOST_TIME", { daysUnableToWork: 4 }),
        incident("LOST_TIME", { daysUnableToWork: 18 }),
      ],
      minutesWorked: 694 * 60,
    });

    expect(record.enoughHoursForRate).toBe(false);
    expect(record.lostTimeRate).toBe(576.4);
    // What makes it unusable, in one figure: a single injury is worth this
    // much of the rate.
    expect(record.ratePerInjury).toBe(288.2);
  });

  it("says yes once there are enough hours behind it", () => {
    const record = safetyRecord({
      incidents: [incident("LOST_TIME")],
      minutesWorked: MEANINGFUL_HOURS * 60,
    });

    expect(record.enoughHoursForRate).toBe(true);
    expect(record.ratePerInjury).toBe(4);
  });

  it("is never enough hours when there are none", () => {
    const record = safetyRecord({ incidents: [], minutesWorked: 0 });

    expect(record.enoughHoursForRate).toBe(false);
    expect(record.ratePerInjury).toBeNull();
  });
});

describe("severity", () => {
  it("measures days lost rather than accidents had", () => {
    // Two injuries, one trivial and one that cost six weeks. The frequency
    // rate cannot tell them apart; this is what does.
    const record = safetyRecord({
      incidents: [
        incident("LOST_TIME", { daysUnableToWork: 1 }),
        incident("LOST_TIME", { daysUnableToWork: 41 }),
      ],
      minutesWorked: RATE_BASE_HOURS * 60,
    });

    expect(record.daysLost).toBe(42);
    expect(record.severityRate).toBe(42);
  });

  it("treats an unknown number of days off as none rather than guessing", () => {
    const record = safetyRecord({
      incidents: [incident("LOST_TIME")],
      minutesWorked: RATE_BASE_HOURS * 60,
    });

    expect(record.daysLost).toBe(0);
  });
});

describe("the sign on the gate", () => {
  it("counts days since the most recent lost-time injury", () => {
    const record = safetyRecord({
      incidents: [
        incident("LOST_TIME", { occurredAt: new Date("2026-01-05T06:00:00.000Z") }),
        incident("LOST_TIME", { occurredAt: MARCH }),
      ],
      minutesWorked: 0,
      asAt: JUNE,
    });

    expect(record.lastLostTimeAt).toEqual(MARCH);
    expect(record.daysSinceLastLostTime).toBe(92);
  });

  it("ignores a near miss, however recent", () => {
    const record = safetyRecord({
      incidents: [
        incident("LOST_TIME", { occurredAt: MARCH }),
        incident("NEAR_MISS", { occurredAt: JUNE }),
      ],
      minutesWorked: 0,
      asAt: JUNE,
    });

    expect(record.lastLostTimeAt).toEqual(MARCH);
  });

  it("has nothing to count when there has never been one", () => {
    // Null rather than a very large number: "never" is not "a long time ago".
    const record = safetyRecord({
      incidents: [incident("NEAR_MISS")],
      minutesWorked: 0,
      asAt: JUNE,
    });

    expect(record.lastLostTimeAt).toBeNull();
    expect(record.daysSinceLastLostTime).toBeNull();
  });

  it("finds the latest whatever order they arrive in", () => {
    const latest = lastLostTime([
      incident("FATALITY", { occurredAt: JUNE }),
      incident("LOST_TIME", { occurredAt: MARCH }),
    ]);

    expect(latest?.occurredAt).toEqual(JUNE);
  });
});

describe("the hierarchy of control", () => {
  it("counts guarding and redesign as fixing the job", () => {
    expect(hardControlShare(["ENGINEERING", "ELIMINATION"])).toBe(100);
  });

  it("counts a toolbox talk and new gloves as not fixing it", () => {
    expect(hardControlShare(["ADMINISTRATIVE", "PPE"])).toBe(0);
  });

  it("gives the share when the register is a mixture", () => {
    expect(hardControlShare(["ENGINEERING", "PPE", "PPE", "SUBSTITUTION"])).toBe(
      50,
    );
  });

  it("says nothing rather than nought per cent for an empty register", () => {
    // 0% reads as an accusation against a company that has simply had no
    // incidents to correct.
    expect(hardControlShare([])).toBeNull();
  });
});

describe("hours", () => {
  it("takes minutes, because that is what a timesheet holds", () => {
    const record = safetyRecord({ incidents: [], minutesWorked: 90 * 60 });
    expect(record.hoursWorked).toBe(90);
  });
});

describe("days between", () => {
  it("floors part days", () => {
    expect(
      daysSince(
        new Date("2026-06-01T23:00:00.000Z"),
        new Date("2026-06-03T01:00:00.000Z"),
      ),
    ).toBe(1);
  });
});
