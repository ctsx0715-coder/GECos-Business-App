import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError } from "@/lib/errors";
import { hseService } from "@/modules/hse/hse.service";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * Health and safety, weighted towards the two rules that carry the module.
 *
 * An incident cannot close while a corrective action is open, and whoever
 * investigated it cannot be the one to close it. Both are the sort of rule
 * that looks like a nicety in a specification and turns out, a year later, to
 * be the only reason anything ever got fixed — so most of what follows is
 * about them rather than about creating rows.
 */

let org: SeededOrg;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
});

afterAll(async () => {
  await rawDb.$disconnect();
});

/** Yesterday, so nothing trips the "that is in the future" rule. */
function yesterday(): Date {
  return new Date(Date.now() - 86_400_000);
}

function aNearMiss(overrides: Record<string, unknown> = {}) {
  return as("safety_officer", () =>
    hseService.report({
      kind: "NEAR_MISS",
      occurredAt: yesterday(),
      description: "A scaffold plank was not clipped and slid when stepped on.",
      ...overrides,
    }),
  );
}

describe("reporting", () => {
  it("allocates a reference and starts as reported", async () => {
    const incident = await aNearMiss();

    expect(incident.reference).toMatch(/^INC-\d{4}-\d{4}$/);
    expect(incident.status).toBe("REPORTED");
  });

  it("lets an ordinary employee report one", async () => {
    // The whole value of a near-miss system is the man who nearly got hit
    // telling somebody the same afternoon. Asking his permission collects
    // nothing.
    const incident = await as("employee", () =>
      hseService.report({
        kind: "NEAR_MISS",
        occurredAt: yesterday(),
        description: "The tower crane slewed over the pedestrian gate again.",
      }),
    );

    expect(incident.reference).toBeTruthy();
  });

  it("does not let that employee read the register", async () => {
    // The rows name injured people and their injuries. Being able to file one
    // is a long way from being able to read them all.
    await aNearMiss();
    await expect(as("employee", () => hseService.list())).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("refuses an injury with nobody attached to it", async () => {
    // Cannot be reported to the Compensation Fund, cannot become sick leave,
    // cannot be followed up.
    await expect(
      aNearMiss({ kind: "LOST_TIME", injuredPersonName: undefined }),
    ).rejects.toThrow();
  });

  it("takes somebody who is not on the payroll by name", async () => {
    const incident = await aNearMiss({
      kind: "MEDICAL_TREATMENT",
      injuredPersonName: "Sipho Ndlovu (Mabaso Plumbing)",
    });

    expect(incident.injuredEmployeeId).toBeNull();
    expect(incident.injuredPersonName).toContain("Mabaso");
  });

  it("refuses an incident that has not happened yet", async () => {
    await expect(
      aNearMiss({ occurredAt: new Date(Date.now() + 86_400_000) }),
    ).rejects.toThrow();
  });
});

describe("what the law wants told", () => {
  it("comes back with the register rather than one incident at a time", async () => {
    await aNearMiss({ dangerousOccurrence: true });
    const [incident] = await as("safety_officer", () => hseService.list());

    expect(incident.obligations.filings.map((f) => f.to)).toEqual([
      "Department of Employment and Labour",
    ]);
  });

  it("is worked out again when the classification changes", async () => {
    // The case this exists for: first aid on Tuesday, lost time on Friday
    // when the man does not come back.
    const incident = await aNearMiss({
      kind: "FIRST_AID",
      injuredPersonName: "Thabo Mokoena",
    });

    const before = await as("safety_officer", () =>
      hseService.getById(incident.id),
    );
    expect(before.obligations.filings).toHaveLength(0);

    await as("safety_officer", () =>
      hseService.investigate({
        incidentId: incident.id,
        kind: "LOST_TIME",
        daysUnableToWork: 21,
      }),
    );

    const after = await as("safety_officer", () => hseService.getById(incident.id));
    expect(after.obligations.filings.map((f) => f.to)).toEqual([
      "Department of Employment and Labour",
      "Compensation Fund",
    ]);
  });

  it("stops asking for a filing once it has been recorded", async () => {
    const incident = await aNearMiss({ dangerousOccurrence: true });

    await as("safety_officer", () =>
      hseService.recordFiling({
        incidentId: incident.id,
        to: "DEPARTMENT",
        filedAt: new Date(),
        externalReference: "GP/2026/00412",
      }),
    );

    const after = await as("safety_officer", () => hseService.getById(incident.id));
    expect(after.obligations.filings[0].filedAt).not.toBeNull();
    expect(after.externalReference).toBe("GP/2026/00412");
  });

  it("refuses a filing dated before the incident", async () => {
    const incident = await aNearMiss({ dangerousOccurrence: true });

    await expect(
      as("safety_officer", () =>
        hseService.recordFiling({
          incidentId: incident.id,
          to: "DEPARTMENT",
          filedAt: new Date("2020-01-01T00:00:00.000Z"),
        }),
      ),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe("closing it out", () => {
  async function investigated() {
    const incident = await aNearMiss();
    await as("safety_officer", () =>
      hseService.investigate({
        incidentId: incident.id,
        rootCause: "Scaffold inspection was signed without being done.",
      }),
    );
    return incident;
  }

  it("will not close while a corrective action is open", async () => {
    const incident = await investigated();
    await as("safety_officer", () =>
      hseService.addAction({
        incidentId: incident.id,
        description: "Fit edge protection to the east stair core.",
        control: "ENGINEERING",
        dueAt: new Date(Date.now() + 7 * 86_400_000),
      }),
    );

    await expect(
      as("project_manager", () => hseService.close({ incidentId: incident.id })),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("closes once the action is done", async () => {
    const incident = await investigated();
    const action = await as("safety_officer", () =>
      hseService.addAction({
        incidentId: incident.id,
        description: "Fit edge protection to the east stair core.",
        control: "ENGINEERING",
        dueAt: new Date(Date.now() + 7 * 86_400_000),
      }),
    );

    await as("employee", () =>
      hseService.completeAction({ actionId: action.id, completedNote: "Rail up." }),
    );
    const closed = await as("project_manager", () =>
      hseService.close({ incidentId: incident.id }),
    );

    expect(closed.status).toBe("CLOSED");
    expect(closed.closedById).toBe(org.userIds.project_manager);
  });

  it("will not let the investigator close their own investigation", async () => {
    // The seeded Safety Officer holds `investigate` and not `close` precisely
    // so this cannot be reached that way — but an executive holds both, and
    // the rule has to hold for them too.
    const incident = await aNearMiss();
    await as("executive", () =>
      hseService.investigate({
        incidentId: incident.id,
        rootCause: "Nobody checked the scaffold tag.",
      }),
    );

    await expect(
      as("executive", () => hseService.close({ incidentId: incident.id })),
    ).rejects.toThrow(ForbiddenError);
  });

  it("does not let a safety officer close one at all", async () => {
    const incident = await investigated();

    await expect(
      as("safety_officer", () => hseService.close({ incidentId: incident.id })),
    ).rejects.toThrow(ForbiddenError);
  });

  it("will not take a new action on a closed incident", async () => {
    const incident = await investigated();
    await as("project_manager", () => hseService.close({ incidentId: incident.id }));

    await expect(
      as("safety_officer", () =>
        hseService.addAction({
          incidentId: incident.id,
          description: "Something nobody would ever chase.",
          control: "PPE",
          dueAt: new Date(Date.now() + 86_400_000),
        }),
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("will not investigate a closed incident either", async () => {
    const incident = await investigated();
    await as("project_manager", () => hseService.close({ incidentId: incident.id }));

    await expect(
      as("safety_officer", () =>
        hseService.investigate({ incidentId: incident.id, rootCause: "Second thoughts." }),
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("refuses to complete an action twice", async () => {
    const incident = await investigated();
    const action = await as("safety_officer", () =>
      hseService.addAction({
        incidentId: incident.id,
        description: "Re-brief the scaffold crew.",
        control: "ADMINISTRATIVE",
        dueAt: new Date(Date.now() + 86_400_000),
      }),
    );

    await as("employee", () => hseService.completeAction({ actionId: action.id }));
    await expect(
      as("employee", () => hseService.completeAction({ actionId: action.id })),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe("the safety record", () => {
  it("has no rate at all when nobody has worked any hours", async () => {
    // Not zero. A company with no timesheets has not earned a clean record.
    await aNearMiss();
    const record = await as("safety_officer", () =>
      hseService.record(new Date(Date.now() - 30 * 86_400_000), new Date()),
    );

    expect(record.hoursWorked).toBe(0);
    expect(record.lostTimeRate).toBeNull();
  });

  it("counts lost time and leaves near misses out of it", async () => {
    await aNearMiss();
    await aNearMiss({
      kind: "LOST_TIME",
      injuredPersonName: "Thabo Mokoena",
      daysUnableToWork: 4,
    });

    const record = await as("safety_officer", () =>
      hseService.record(new Date(Date.now() - 30 * 86_400_000), new Date()),
    );

    expect(record.lostTimeCount).toBe(1);
    expect(record.daysLost).toBe(4);
  });

  it("counts days since the last lost-time injury from outside the window", async () => {
    // A company does not get its counter reset by choosing a later start date.
    await aNearMiss({
      kind: "LOST_TIME",
      injuredPersonName: "Thabo Mokoena",
      occurredAt: new Date(Date.now() - 60 * 86_400_000),
    });

    const record = await as("safety_officer", () =>
      hseService.record(new Date(Date.now() - 7 * 86_400_000), new Date()),
    );

    expect(record.lostTimeCount).toBe(0);
    expect(record.daysSinceLastLostTime).toBe(60);
  });

  it("shows the share of fixes that change the job rather than the worker", async () => {
    const incident = await aNearMiss();
    for (const control of ["ENGINEERING", "PPE", "PPE", "ADMINISTRATIVE"] as const) {
      await as("safety_officer", () =>
        hseService.addAction({
          incidentId: incident.id,
          description: `A ${control.toLowerCase()} fix.`,
          control,
          dueAt: new Date(Date.now() + 86_400_000),
        }),
      );
    }

    const record = await as("safety_officer", () =>
      hseService.record(new Date(Date.now() - 30 * 86_400_000), new Date()),
    );

    expect(record.hardControlShare).toBe(25);
  });
});

describe("what is late", () => {
  it("lists a filing nobody has made, soonest first", async () => {
    await aNearMiss({
      kind: "FATALITY",
      injuredPersonName: "A subcontractor's rigger",
      occurredAt: new Date(Date.now() - 10 * 86_400_000),
    });

    const late = await as("safety_officer", () => hseService.whatIsLate());

    expect(late.filings).toHaveLength(2);
    expect(late.filings[0].filing.overdue).toBe(true);
  });

  it("asks how long somebody will be off when nobody has said", async () => {
    await aNearMiss({ kind: "LOST_TIME", injuredPersonName: "Thabo Mokoena" });

    const late = await as("safety_officer", () => hseService.whatIsLate());

    expect(late.unanswered).toHaveLength(1);
    expect(late.unanswered[0].question).toContain("14");
  });

  it("stops chasing an incident once it is closed", async () => {
    const incident = await aNearMiss({ dangerousOccurrence: true });
    await as("safety_officer", () =>
      hseService.investigate({ incidentId: incident.id, rootCause: "Hose perished." }),
    );
    await as("project_manager", () => hseService.close({ incidentId: incident.id }));

    const late = await as("safety_officer", () => hseService.whatIsLate());
    expect(late.filings).toHaveLength(0);
  });
});

describe("tenancy", () => {
  it("keeps one company's incidents out of another's register", async () => {
    await aNearMiss();
    const other = await seedOrganisation("Bosele Civils");

    const theirs = await withRequestContext(
      { organisationId: other.organisationId, userId: other.userIds.safety_officer },
      () => hseService.list(),
    );

    expect(theirs).toHaveLength(0);
  });
});
