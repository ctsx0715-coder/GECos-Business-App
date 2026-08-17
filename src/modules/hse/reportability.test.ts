import { describe, expect, it } from "vitest";
import {
  daysUntil,
  outstandingFilings,
  overdueFilings,
  reportability,
  type IncidentFacts,
} from "./reportability";

/**
 * The two duties, kept apart.
 *
 * Most of these exist because the failure they describe is silent: nobody
 * notices a filing that was never raised. So each one names a real incident
 * and asserts which of the two departments hears about it, rather than
 * checking a count.
 */

const MONDAY = new Date("2026-06-01T07:30:00.000Z");

function facts(overrides: Partial<IncidentFacts> = {}): IncidentFacts {
  return {
    kind: "NEAR_MISS",
    occurredAt: MONDAY,
    reportedAt: MONDAY,
    daysUnableToWork: null,
    dangerousOccurrence: false,
    reportedToDepartmentAt: null,
    reportedToFundAt: null,
    ...overrides,
  };
}

/** Which bodies a set of facts owes a filing to, as plain strings. */
function owedTo(overrides: Partial<IncidentFacts> = {}): string[] {
  return reportability(facts(overrides), MONDAY).filings.map((f) => f.to);
}

describe("who has to be told", () => {
  it("tells nobody about a near miss that hurt no one", () => {
    expect(owedTo({ kind: "NEAR_MISS" })).toEqual([]);
  });

  it("tells nobody about a plaster from the site box", () => {
    // A first-aid case is not a compensation claim, and filing one for every
    // splinter buries the claims that matter.
    expect(owedTo({ kind: "FIRST_AID", daysUnableToWork: 0 })).toEqual([]);
  });

  it("tells the Compensation Fund when somebody needed a doctor", () => {
    expect(owedTo({ kind: "MEDICAL_TREATMENT" })).toEqual(["Compensation Fund"]);
  });

  it("does not trouble the Department with a short spell off work", () => {
    // Thirteen days is not fourteen. The worker still gets compensated.
    expect(owedTo({ kind: "LOST_TIME", daysUnableToWork: 13 })).toEqual([
      "Compensation Fund",
    ]);
  });

  it("tells both once the person has been off for fourteen days", () => {
    expect(owedTo({ kind: "LOST_TIME", daysUnableToWork: 14 })).toEqual([
      "Department of Employment and Labour",
      "Compensation Fund",
    ]);
  });

  it("tells both when somebody dies", () => {
    expect(owedTo({ kind: "FATALITY" })).toEqual([
      "Department of Employment and Labour",
      "Compensation Fund",
    ]);
  });

  it("tells the Department about a runaway machine that hurt nobody", () => {
    // Section 24(1)(c) is about the workplace being dangerous, not about
    // anybody being hurt. Nothing is owed to the Fund: there is no claimant.
    expect(owedTo({ kind: "NEAR_MISS", dangerousOccurrence: true })).toEqual([
      "Department of Employment and Labour",
    ]);
  });

  it("tells the Department about a spill even when it is only property damage", () => {
    expect(
      owedTo({ kind: "PROPERTY_DAMAGE", dangerousOccurrence: true }),
    ).toEqual(["Department of Employment and Labour"]);
  });
});

describe("the clocks, which are not the same clock", () => {
  it("runs the Department's seven days from the incident", () => {
    const report = reportability(facts({ kind: "FATALITY" }), MONDAY);
    const filing = report.filings.find((f) => f.under.startsWith("OHSA"))!;

    expect(filing.dueBy.toISOString()).toBe("2026-06-08T07:30:00.000Z");
  });

  it("runs the Fund's seven days from when the employer found out", () => {
    // A Friday injury mentioned to the foreman on Monday. COIDA says "within
    // seven days after having received notice", so the weekend is not spent.
    const report = reportability(
      facts({
        kind: "MEDICAL_TREATMENT",
        occurredAt: new Date("2026-05-29T14:00:00.000Z"),
        reportedAt: MONDAY,
      }),
      MONDAY,
    );
    const filing = report.filings.find((f) => f.under.startsWith("COIDA"))!;

    expect(filing.dueBy.toISOString()).toBe("2026-06-08T07:30:00.000Z");
  });

  it("counts a filing late only once its date has passed", () => {
    const late = reportability(
      facts({ kind: "FATALITY" }),
      new Date("2026-06-09T00:00:00.000Z"),
    );
    expect(overdueFilings(late)).toHaveLength(2);

    const stillInTime = reportability(
      facts({ kind: "FATALITY" }),
      new Date("2026-06-07T00:00:00.000Z"),
    );
    expect(overdueFilings(stillInTime)).toHaveLength(0);
  });

  it("stops chasing a filing that has been made", () => {
    const report = reportability(
      facts({
        kind: "FATALITY",
        reportedToDepartmentAt: new Date("2026-06-02T09:00:00.000Z"),
      }),
      new Date("2026-06-20T00:00:00.000Z"),
    );

    expect(overdueFilings(report).map((f) => f.to)).toEqual([
      "Compensation Fund",
    ]);
    expect(outstandingFilings(report).map((f) => f.to)).toEqual([
      "Compensation Fund",
    ]);
  });
});

describe("what nobody knows yet", () => {
  it("asks how long they will be off rather than guessing", () => {
    const report = reportability(facts({ kind: "LOST_TIME" }), MONDAY);

    expect(report.filings.map((f) => f.to)).toEqual(["Compensation Fund"]);
    expect(report.unanswered).toHaveLength(1);
    expect(report.unanswered[0]).toContain("14");
  });

  it("stops asking once the number is filled in", () => {
    const report = reportability(
      facts({ kind: "LOST_TIME", daysUnableToWork: 3 }),
      MONDAY,
    );

    expect(report.unanswered).toEqual([]);
  });

  it("does not ask about an injury that was never lost time", () => {
    expect(reportability(facts({ kind: "FIRST_AID" }), MONDAY).unanswered).toEqual(
      [],
    );
  });
});

describe("before anybody tidies up", () => {
  it("says to leave the scene alone after a death", () => {
    const report = reportability(facts({ kind: "FATALITY" }), MONDAY);
    expect(report.atOnce.join(" ")).toContain("s24(3)");
  });

  it("says to leave the scene alone after a lost limb", () => {
    const report = reportability(facts({ kind: "PERMANENT_DISABILITY" }), MONDAY);
    expect(report.atOnce.join(" ")).toContain("s24(3)");
  });

  it("does not freeze a site over a cut finger", () => {
    expect(reportability(facts({ kind: "FIRST_AID" }), MONDAY).atOnce).toEqual([]);
  });

  it("still says to phone when a spill is reportable but nobody was hurt", () => {
    const report = reportability(
      facts({ kind: "PROPERTY_DAMAGE", dangerousOccurrence: true }),
      MONDAY,
    );

    expect(report.atOnce).toHaveLength(1);
    expect(report.atOnce[0]).toContain("phone");
  });
});

describe("the incident book", () => {
  it("records anything that cost somebody a day", () => {
    expect(
      reportability(facts({ kind: "LOST_TIME", daysUnableToWork: 1 }), MONDAY)
        .mustBeRecorded,
    ).toBe(true);
  });

  it("records a first-aid case that still cost a day", () => {
    expect(
      reportability(facts({ kind: "FIRST_AID", daysUnableToWork: 1 }), MONDAY)
        .mustBeRecorded,
    ).toBe(true);
  });

  it("does not record a near miss", () => {
    // Worth keeping — it is in the register — but the three-year statutory
    // record is about injuries.
    expect(reportability(facts({ kind: "NEAR_MISS" }), MONDAY).mustBeRecorded).toBe(
      false,
    );
  });

  it("does not record treatment that lost no time", () => {
    expect(
      reportability(
        facts({ kind: "MEDICAL_TREATMENT", daysUnableToWork: 0 }),
        MONDAY,
      ).mustBeRecorded,
    ).toBe(false);
  });
});

describe("how long is left", () => {
  it("counts whole days down and then past zero", () => {
    const due = new Date("2026-06-08T07:30:00.000Z");

    expect(daysUntil(due, new Date("2026-06-06T07:30:00.000Z"))).toBe(2);
    expect(daysUntil(due, new Date("2026-06-08T07:30:00.000Z"))).toBe(0);
    expect(daysUntil(due, new Date("2026-06-10T07:30:00.000Z"))).toBe(-2);
  });
});
