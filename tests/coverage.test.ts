import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { ForbiddenError } from "@/lib/errors";
import { hrService } from "@/modules/hr/hr.service";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * Staffing rules, and whether a week is covered.
 *
 * The arithmetic of comparing a count to a rule is tested without a database
 * in `staffing.test.ts`. What needs one is the counting itself, which is the
 * part that can be quietly wrong: somebody on leave still shows in the
 * register, somebody on a six-day pattern is available on a Saturday that
 * everybody else has off, and a rule about a site must not count people
 * standing on a different one.
 */

let org: SeededOrg;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

/** Monday 5 January 2026 and the week that follows it. */
const MONDAY = new Date("2026-01-05T00:00:00.000Z");
const SUNDAY = new Date("2026-01-11T00:00:00.000Z");

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
});

afterAll(async () => {
  await rawDb.$disconnect();
});

async function officeWeek() {
  return as("hr_manager", () =>
    hrService.createWorkPattern({
      code: "OFFICE",
      name: "Office week",
      cycleDays: 7,
      workingDayIndexes: [0, 1, 2, 3, 4],
      isDefault: true,
    }),
  );
}

async function sixDayWeek() {
  return as("hr_manager", () =>
    hrService.createWorkPattern({
      code: "SITE_6DAY",
      name: "Six-day week",
      cycleDays: 7,
      workingDayIndexes: [0, 1, 2, 3, 4, 5],
    }),
  );
}

async function crew(names: string[], patternId: string, department = "Delivery") {
  const people: Array<{ id: string }> = [];
  for (const name of names) {
    const employee = await as("hr_manager", () =>
      hrService.createEmployee({
        firstName: name,
        lastName: "Dlamini",
        department,
        startedAt: day("2024-01-01"),
      }),
    );
    people.push(employee);
  }

  await as("hr_manager", () =>
    hrService.assignPatterns({
      employeeIds: people.map((person) => person.id),
      workPatternId: patternId,
      startsOn: day("2025-06-01"),
      weeks: null,
    }),
  );

  return people;
}

async function aRule(overrides: Record<string, unknown> = {}) {
  return as("hr_manager", () =>
    hrService.createStaffingRule({
      name: "Delivery crew",
      department: "Delivery",
      weekdays: [0, 1, 2, 3, 4],
      minimumPeople: 3,
      ...overrides,
    }),
  );
}

function cellOn(
  rule: {
    cells: Array<{
      date: string;
      actual: number;
      coverage: string;
      applies: boolean;
      closed: boolean;
      atRisk: number;
    }>;
  },
  iso: string,
) {
  return rule.cells.find((cell) => cell.date === iso)!;
}

describe("counting who is available", () => {
  it("counts the people whose pattern has them working that day", async () => {
    const office = await officeWeek();
    await crew(["Anele", "Bongani", "Chris"], office.id);
    await aRule();

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    const [rule] = week.rules;

    expect(cellOn(rule, "2026-01-06").actual).toBe(3);
    expect(cellOn(rule, "2026-01-06").coverage).toBe("OK");
  });

  it("does not count somebody the day their pattern has them off", async () => {
    const office = await officeWeek();
    const six = await sixDayWeek();
    await crew(["Anele", "Bongani"], office.id);
    await crew(["Chris"], six.id);

    // A Saturday rule: only the six-day worker is due in.
    await aRule({ name: "Saturday cover", weekdays: [5], minimumPeople: 2 });

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    const [rule] = week.rules;
    const saturday = cellOn(rule, "2026-01-10");

    expect(saturday.actual).toBe(1);
    expect(saturday.coverage).toBe("SHORT");
  });

  it("says nothing about a day the rule does not apply to", async () => {
    const office = await officeWeek();
    await crew(["Anele"], office.id);
    await aRule({ weekdays: [0], minimumPeople: 1 });

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    const [rule] = week.rules;

    expect(cellOn(rule, "2026-01-05").applies).toBe(true);
    expect(cellOn(rule, "2026-01-06").applies).toBe(false);
  });

  it("does not count a day the company is closed", async () => {
    const office = await officeWeek();
    await crew(["Anele", "Bongani", "Chris"], office.id);
    await aRule();
    await as("hr_manager", () =>
      hrService.addHoliday({
        observedOn: day("2026-01-07"),
        name: "Founder's day",
      }),
    );

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    const [rule] = week.rules;

    /*
     * Closed rather than short. Nobody is due in, so every rule would read
     * zero against its minimum and the week would show a wall of red for a
     * day that went exactly as intended.
     */
    const wednesday = cellOn(rule, "2026-01-07");
    expect(wednesday.applies).toBe(false);
    expect(wednesday.closed).toBe(true);

    expect(week.rules[0].verdict).toBe("OK");
    expect(week.totals.shortDays).toBe(0);
  });
});

describe("leave and coverage", () => {
  async function withLeave(status: "APPROVED" | "SUBMITTED") {
    const office = await officeWeek();
    const people = await crew(["Anele", "Bongani", "Chris"], office.id);
    await aRule();

    const type = await as("hr_manager", () =>
      hrService.createLeaveType({
        code: "ANNUAL",
        name: "Annual leave",
        daysPerCycle: 21,
        allowsBackdating: true,
      }),
    );
    await as("hr_manager", () =>
      hrService.setBalance({
        employeeId: people[0].id,
        leaveTypeId: type.id,
        cycleStartsAt: day("2026-01-01"),
        cycleEndsAt: day("2026-12-31"),
        entitledDays: 21,
      }),
    );
    const request = await as("hr_manager", () =>
      hrService.requestLeave({
        employeeId: people[0].id,
        leaveTypeId: type.id,
        startsAt: day("2026-01-06"),
        endsAt: day("2026-01-06"),
      }),
    );

    if (status === "APPROVED") {
      await as("executive", () =>
        hrService.decideLeave({ requestId: request.id, decision: "APPROVED" }),
      );
    }

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    return week.rules[0];
  }

  it("takes away somebody whose leave has been approved", async () => {
    const rule = await withLeave("APPROVED");
    const tuesday = cellOn(rule, "2026-01-06");

    expect(tuesday.actual).toBe(2);
    expect(tuesday.coverage).toBe("SHORT");
  });

  it("still counts somebody who has only asked, and says what it would cost", async () => {
    const rule = await withLeave("SUBMITTED");
    const tuesday = cellOn(rule, "2026-01-06");

    // Requested is not granted, so they are still on the strength — but the
    // person deciding the request is owed the consequence of approving it.
    expect(tuesday.actual).toBe(3);
    expect(tuesday.coverage).toBe("OK");
    expect(tuesday.atRisk).toBe(1);
  });
});

describe("what a rule narrows by", () => {
  it("counts only the department it names", async () => {
    const office = await officeWeek();
    await crew(["Anele", "Bongani"], office.id, "Delivery");
    await crew(["Chris", "Dumi"], office.id, "Workshop");
    await aRule({ minimumPeople: 3 });

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    expect(cellOn(week.rules[0], "2026-01-06").actual).toBe(2);
  });

  it("counts everybody when it names nothing", async () => {
    const office = await officeWeek();
    await crew(["Anele", "Bongani"], office.id, "Delivery");
    await crew(["Chris", "Dumi"], office.id, "Workshop");
    await aRule({ name: "Anybody at all", department: null, minimumPeople: 3 });

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    expect(cellOn(week.rules[0], "2026-01-06").actual).toBe(4);
  });
});

describe("the week's verdict", () => {
  it("is short when any day in it is", async () => {
    const office = await officeWeek();
    const people = await crew(["Anele", "Bongani", "Chris"], office.id);
    await aRule();

    const type = await as("hr_manager", () =>
      hrService.createLeaveType({
        code: "ANNUAL",
        name: "Annual leave",
        daysPerCycle: 21,
        allowsBackdating: true,
      }),
    );
    await as("hr_manager", () =>
      hrService.setBalance({
        employeeId: people[0].id,
        leaveTypeId: type.id,
        cycleStartsAt: day("2026-01-01"),
        cycleEndsAt: day("2026-12-31"),
        entitledDays: 21,
      }),
    );
    const request = await as("hr_manager", () =>
      hrService.requestLeave({
        employeeId: people[0].id,
        leaveTypeId: type.id,
        startsAt: day("2026-01-08"),
        endsAt: day("2026-01-08"),
      }),
    );
    await as("executive", () =>
      hrService.decideLeave({ requestId: request.id, decision: "APPROVED" }),
    );

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    expect(week.rules[0].verdict).toBe("SHORT");
    expect(week.rules[0].worstShortfall).toBe(1);
    expect(week.totals.short).toBe(1);
    expect(week.totals.shortDays).toBe(1);
  });

  it("is never over when the rule sets no ceiling", async () => {
    const office = await officeWeek();
    await crew(["Anele", "Bongani", "Chris", "Dumi", "Ellen"], office.id);
    await aRule({ minimumPeople: 2 });

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    expect(week.rules[0].verdict).toBe("OK");
    expect(week.totals.over).toBe(0);
  });

  it("is over when there is one and the crew exceeds it", async () => {
    const office = await officeWeek();
    await crew(["Anele", "Bongani", "Chris", "Dumi"], office.id);
    await aRule({ minimumPeople: 2, maximumPeople: 3 });

    const week = await as("hr_manager", () => hrService.coverageFor(MONDAY, SUNDAY));
    expect(week.rules[0].verdict).toBe("OVER");
  });
});

describe("who may do what", () => {
  it("lets anybody who can read the roster read the coverage", async () => {
    await officeWeek();
    await aRule();
    const week = await as("employee", () => hrService.coverageFor(MONDAY, SUNDAY));
    expect(week.rules).toHaveLength(1);
  });

  it("does not let them write a rule", async () => {
    await expect(
      as("employee", () =>
        hrService.createStaffingRule({
          name: "One of me is plenty",
          minimumPeople: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps one tenant's rules out of another's week", async () => {
    await officeWeek();
    await aRule();

    const other = await seedOrganisation("Kgosi Civils");
    const theirs = await withRequestContext(
      { organisationId: other.organisationId, userId: other.userIds.hr_manager },
      () => hrService.coverageFor(MONDAY, SUNDAY),
    );
    expect(theirs.rules).toHaveLength(0);
  });
});
