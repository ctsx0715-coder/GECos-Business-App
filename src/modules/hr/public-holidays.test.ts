import { describe, expect, it } from "vitest";
import { easterSunday, isoDate, statutoryHolidays } from "./public-holidays";

/**
 * The holiday calendar, pinned to published dates.
 *
 * Easter is computed by an arithmetic recipe nobody can verify by reading it,
 * so it is checked against a decade of known Sundays instead. The rest is the
 * Public Holidays Act, and the cases that matter are the awkward ones: a
 * holiday landing on a Sunday, and Christmas landing on a Saturday so that the
 * Day of Goodwill takes the Sunday and the Monday carries both.
 */

function dates(year: number): Record<string, string> {
  const byName: Record<string, string> = {};
  for (const holiday of statutoryHolidays(year)) {
    byName[holiday.name] = isoDate(holiday.observedOn);
  }
  return byName;
}

describe("Easter", () => {
  it("matches the published Sundays", () => {
    const published: Record<number, string> = {
      2020: "2020-04-12",
      2021: "2021-04-04",
      2022: "2022-04-17",
      2023: "2023-04-09",
      2024: "2024-03-31",
      2025: "2025-04-20",
      2026: "2026-04-05",
      2027: "2027-03-28",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
    };

    for (const [year, expected] of Object.entries(published)) {
      expect(isoDate(easterSunday(Number(year)))).toBe(expected);
    }
  });
});

describe("the statutory calendar", () => {
  it("puts Good Friday and Family Day around Easter", () => {
    const holidays = dates(2026);
    // Easter Sunday 2026 is 5 April.
    expect(holidays["Good Friday"]).toBe("2026-04-03");
    expect(holidays["Family Day"]).toBe("2026-04-06");
  });

  it("has the fixed days on their dates", () => {
    const holidays = dates(2026);
    expect(holidays["Freedom Day"]).toBe("2026-04-27");
    expect(holidays["Youth Day"]).toBe("2026-06-16");
    expect(holidays["Heritage Day"]).toBe("2026-09-24");
    expect(holidays["Day of Reconciliation"]).toBe("2026-12-16");
  });

  it("observes a Sunday holiday on the Monday", () => {
    // Human Rights Day 2027 falls on a Sunday, so it is taken on the Monday.
    expect(dates(2027)["Human Rights Day"]).toBe("2027-03-22");
    // Workers' Day 2022 fell on a Sunday too.
    expect(dates(2022)["Workers' Day"]).toBe("2022-05-02");
  });

  it("leaves a Saturday holiday where it is", () => {
    // The Act moves Sundays only. 21 March 2026 is a Saturday and stays put —
    // which costs nobody a leave day, because Saturday was never a work day.
    expect(dates(2026)["Human Rights Day"]).toBe("2026-03-21");
  });

  it("merges Christmas and the Day of Goodwill when they collide", () => {
    /*
     * 2021: Christmas was a Saturday, so the Day of Goodwill fell on the
     * Sunday and moved to Monday the 27th. Two separate entries on the 27th
     * would charge somebody two leave days for one day off.
     */
    const holidays = statutoryHolidays(2021);
    const boxing = holidays.filter(
      (holiday) => isoDate(holiday.observedOn) === "2021-12-27",
    );
    expect(boxing).toHaveLength(1);
    expect(boxing[0].name).toContain("Day of Goodwill");
  });

  it("never lists the same day twice", () => {
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      const days = statutoryHolidays(year).map((holiday) =>
        isoDate(holiday.observedOn),
      );
      expect(new Set(days).size).toBe(days.length);
    }
  });
});
