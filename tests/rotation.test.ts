import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError } from "@/lib/errors";
import { hrService } from "@/modules/hr/hr.service";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * Bulk assignment, rotation and the fairness watch.
 *
 * The arithmetic is tested without a database in `rotation.test.ts` beside the
 * module. What needs one is everything about *when* a turn takes effect and
 * what the system says about it: a turn written for next month must not move
 * anybody today, a turn whose day has come must move them exactly once, and
 * the fairness rule must warn without ever refusing — which is the rule most
 * likely to be quietly "improved" into a block by somebody who has not read
 * why it is not one.
 */

let org: SeededOrg;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function daysFromNow(offset: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
});

afterAll(async () => {
  await rawDb.$disconnect();
});

async function nights(overrides = {}) {
  return as("hr_manager", () =>
    hrService.createWorkPattern({
      code: "NIGHTS",
      name: "Night rotation",
      cycleDays: 7,
      workingDayIndexes: [0, 1, 2, 3, 4, 5],
      rotationWeeks: 4,
      maxConsecutiveTurns: 3,
      isDefault: false,
      ...overrides,
    }),
  );
}

async function officeWeek() {
  return as("hr_manager", () =>
    hrService.createWorkPattern({
      code: "OFFICE",
      name: "Office week",
      cycleDays: 7,
      workingDayIndexes: [0, 1, 2, 3, 4],
      // No limit: nobody is hard done by a fourth Monday-to-Friday month.
      maxConsecutiveTurns: null,
      isDefault: true,
    }),
  );
}

async function anEmployee(firstName: string, overrides = {}) {
  return as("hr_manager", () =>
    hrService.createEmployee({
      firstName,
      lastName: "Dlamini",
      jobTitle: "Plant operator",
      department: "Delivery",
      startedAt: day("2024-03-01"),
      ...overrides,
    }),
  );
}

describe("assigning a pattern to several people at once", () => {
  it("puts them all on it in one call", async () => {
    const pattern = await nights();
    const anele = await anEmployee("Anele");
    const pieter = await anEmployee("Pieter");

    const result = await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id, pieter.id],
        workPatternId: pattern.id,
        startsOn: daysFromNow(0),
        weeks: 4,
      }),
    );

    expect(result.assigned).toBe(2);
    expect(result.takesEffectNow).toBe(true);

    const board = await as("hr_manager", () => hrService.assignmentBoard());
    expect(board.map((row) => row.patternName)).toEqual([
      "Night rotation",
      "Night rotation",
    ]);
  });

  it("ends the turn on the last day worked, not the morning after", async () => {
    const pattern = await nights();
    const anele = await anEmployee("Anele");

    const result = await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: pattern.id,
        startsOn: day("2026-01-05"),
        weeks: 4,
      }),
    );

    expect(result.endsOn).toEqual(day("2026-02-01"));
  });

  it("leaves an open-ended turn when no length is given", async () => {
    const pattern = await officeWeek();
    const anele = await anEmployee("Anele");

    const result = await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: pattern.id,
        startsOn: daysFromNow(0),
        weeks: null,
      }),
    );

    expect(result.endsOn).toBeNull();
  });

  it("is not something an ordinary employee may do", async () => {
    const pattern = await nights();
    const anele = await anEmployee("Anele");

    await expect(
      as("employee", () =>
        hrService.assignPatterns({
          employeeIds: [anele.id],
          workPatternId: pattern.id,
          startsOn: daysFromNow(0),
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a pattern that has been retired", async () => {
    const pattern = await nights();
    await officeWeek();
    await as("hr_manager", () =>
      hrService.updateWorkPattern({
        workPatternId: pattern.id,
        name: "Night rotation",
        cycleDays: 7,
        workingDayIndexes: [0, 1, 2, 3, 4, 5],
        isActive: false,
      }),
    );

    const anele = await anEmployee("Anele");
    await expect(
      as("hr_manager", () =>
        hrService.assignPatterns({
          employeeIds: [anele.id],
          workPatternId: pattern.id,
          startsOn: daysFromNow(0),
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe("a turn that starts later", () => {
  it("moves nobody today", async () => {
    const office = await officeWeek();
    const night = await nights();
    const anele = await anEmployee("Anele");

    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: office.id,
        startsOn: daysFromNow(-30),
        weeks: null,
      }),
    );

    const result = await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(14),
        weeks: 4,
      }),
    );

    expect(result.takesEffectNow).toBe(false);

    const [row] = await as("hr_manager", () => hrService.assignmentBoard());
    expect(row.patternName).toBe("Office week");
    expect(row.next?.patternName).toBe("Night rotation");
    expect(row.next?.due).toBe(false);
  });

  it("takes effect once its day arrives, and only once", async () => {
    const office = await officeWeek();
    const night = await nights();
    const anele = await anEmployee("Anele");

    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: office.id,
        startsOn: daysFromNow(-30),
        weeks: null,
      }),
    );
    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(1),
        weeks: 4,
      }),
    );

    // Nothing is due today.
    const early = await as("hr_manager", () => hrService.applyDueTurns());
    expect(early.applied).toHaveLength(0);

    // Tomorrow it is.
    const applied = await as("hr_manager", () =>
      hrService.applyDueTurns(daysFromNow(1)),
    );
    expect(applied.applied).toEqual(["Anele Dlamini"]);

    // And running it again changes nothing, which is what lets the schedule
    // fire every morning without anybody checking whether it already has.
    const again = await as("hr_manager", () =>
      hrService.applyDueTurns(daysFromNow(1)),
    );
    expect(again.applied).toHaveLength(0);

    const [row] = await as("hr_manager", () => hrService.assignmentBoard());
    expect(row.patternName).toBe("Night rotation");
  });

  it("can be called off before it starts", async () => {
    const office = await officeWeek();
    const night = await nights();
    const anele = await anEmployee("Anele");

    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: office.id,
        startsOn: daysFromNow(-30),
      }),
    );
    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(14),
      }),
    );

    const [before] = await as("hr_manager", () => hrService.assignmentBoard());
    await as("hr_manager", () =>
      hrService.cancelTurn({ assignmentId: before.next!.id }),
    );

    const [after] = await as("hr_manager", () => hrService.assignmentBoard());
    expect(after.next).toBeNull();
    expect(after.patternName).toBe("Office week");
  });

  it("cannot be called off once it has started", async () => {
    const night = await nights();
    const anele = await anEmployee("Anele");

    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(0),
      }),
    );

    const turn = await rawDb.patternAssignment.findFirst({
      where: { employeeId: anele.id },
    });
    await expect(
      as("hr_manager", () => hrService.cancelTurn({ assignmentId: turn!.id })),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe("the fairness watch", () => {
  async function threeTurnsOfNights(employeeId: string, patternId: string) {
    for (const offset of [-84, -56, -28]) {
      await as("hr_manager", () =>
        hrService.assignPatterns({
          employeeIds: [employeeId],
          workPatternId: patternId,
          startsOn: daysFromNow(offset),
          weeks: 4,
        }),
      );
    }
  }

  it("says something on the turn that reaches the limit", async () => {
    const night = await nights();
    const anele = await anEmployee("Anele");

    // Two turns behind them, and the third is the one being assigned.
    for (const offset of [-84, -56]) {
      await as("hr_manager", () =>
        hrService.assignPatterns({
          employeeIds: [anele.id],
          workPatternId: night.id,
          startsOn: daysFromNow(offset),
          weeks: 4,
        }),
      );
    }

    const result = await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(-28),
        weeks: 4,
      }),
    );

    expect(result.concerns).toHaveLength(1);
    expect(result.concerns[0]).toContain("Anele Dlamini");
    expect(result.concerns[0]).toContain("3 turns running");
  });

  it("assigns them anyway, because warning is the whole design", async () => {
    const night = await nights();
    const anele = await anEmployee("Anele");
    await threeTurnsOfNights(anele.id, night.id);

    // A fourth, over the limit, still goes through.
    const result = await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(0),
        weeks: 4,
      }),
    );

    expect(result.assigned).toBe(1);
    expect(result.concerns).toHaveLength(1);

    const [row] = await as("hr_manager", () => hrService.assignmentBoard());
    expect(row.patternName).toBe("Night rotation");
    expect(row.turns).toBe(4);
    expect(row.concern).toContain("4 turns running");
  });

  it("stays quiet for a pattern with no limit set", async () => {
    const office = await officeWeek();
    const thabo = await anEmployee("Thabo");

    for (const offset of [-84, -56, -28, 0]) {
      const result = await as("hr_manager", () =>
        hrService.assignPatterns({
          employeeIds: [thabo.id],
          workPatternId: office.id,
          startsOn: daysFromNow(offset),
          weeks: 4,
        }),
      );
      expect(result.concerns).toHaveLength(0);
    }

    const [row] = await as("hr_manager", () => hrService.assignmentBoard());
    expect(row.concern).toBeNull();
    expect(row.limit).toBeNull();
  });

  it("forgets the run when somebody is given something else in between", async () => {
    const office = await officeWeek();
    const night = await nights();
    const anele = await anEmployee("Anele");

    await threeTurnsOfNights(anele.id, night.id);
    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: office.id,
        startsOn: daysFromNow(-14),
        weeks: 2,
      }),
    );

    const result = await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(0),
        weeks: 4,
      }),
    );

    // One turn of days breaks the run: this is their first night turn again.
    expect(result.concerns).toHaveLength(0);
  });

  it("counts each person separately when a crew is moved together", async () => {
    const night = await nights();
    const anele = await anEmployee("Anele");
    const pieter = await anEmployee("Pieter");

    await threeTurnsOfNights(anele.id, night.id);

    const result = await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id, pieter.id],
        workPatternId: night.id,
        startsOn: daysFromNow(0),
        weeks: 4,
      }),
    );

    expect(result.assigned).toBe(2);
    expect(result.concerns).toHaveLength(1);
    expect(result.concerns[0]).toContain("Anele");
  });
});

describe("the history behind a turn", () => {
  it("closes the previous turn the day before the new one starts", async () => {
    const office = await officeWeek();
    const night = await nights();
    const anele = await anEmployee("Anele");

    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: office.id,
        startsOn: day("2026-01-01"),
        weeks: null,
      }),
    );
    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: day("2026-02-02"),
        weeks: 4,
      }),
    );

    const turns = await rawDb.patternAssignment.findMany({
      where: { employeeId: anele.id },
      orderBy: { startsOn: "asc" },
    });
    expect(turns).toHaveLength(2);
    expect(turns[0].endsOn).toEqual(day("2026-02-01"));
  });

  it("replaces a turn assigned twice on the same day rather than stacking it", async () => {
    const night = await nights();
    const anele = await anEmployee("Anele");

    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(0),
        weeks: 4,
      }),
    );
    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(0),
        weeks: 2,
      }),
    );

    // Changing your mind about today is a correction, not a second turn — and
    // counting it as one would have the fairness watch reporting a run that
    // nobody worked.
    const [row] = await as("hr_manager", () => hrService.assignmentBoard());
    expect(row.turns).toBe(1);
    expect(row.until).toEqual(daysFromNow(13));
  });

  it("is one tenant's business and nobody else's", async () => {
    const night = await nights();
    const anele = await anEmployee("Anele");
    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [anele.id],
        workPatternId: night.id,
        startsOn: daysFromNow(0),
      }),
    );

    const other = await seedOrganisation("Kgosi Civils");
    const theirs = await withRequestContext(
      { organisationId: other.organisationId, userId: other.userIds.hr_manager },
      () => hrService.assignmentBoard(),
    );
    expect(theirs).toHaveLength(0);
  });
});
