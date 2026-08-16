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
 * Clocking on, clocking off, and signing the week.
 *
 * The arithmetic is tested without a database in `timesheets.test.ts` beside
 * the module. What needs one is everything about *who* may do it and what the
 * record is allowed to become: clocking somebody in twice, signing off an
 * entry that is still running, and editing one that payroll has already been
 * run against.
 */

let org: SeededOrg;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

function at(iso: string): Date {
  return new Date(`${iso}Z`);
}

const MONDAY = new Date("2026-01-05T00:00:00.000Z");
const SUNDAY = new Date("2026-01-11T00:00:00.000Z");

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
});

afterAll(async () => {
  await rawDb.$disconnect();
});

async function anEmployee(overrides: Record<string, unknown> = {}) {
  return as("hr_manager", () =>
    hrService.createEmployee({
      firstName: "Anele",
      lastName: "Dlamini",
      jobTitle: "Boilermaker",
      department: "Workshop",
      startedAt: at("2024-01-01T00:00:00"),
      ...overrides,
    }),
  );
}

async function aWorkedDay(
  employeeId: string,
  from = "2026-01-05T07:00:00",
  to = "2026-01-05T16:00:00",
) {
  await as("hr_manager", () =>
    hrService.clockIn({ employeeId, at: at(from) }),
  );
  return as("hr_manager", () =>
    hrService.clockOut({ employeeId, at: at(to), breakMinutes: 60 }),
  );
}

describe("clocking on and off", () => {
  it("records the two moments and works the hours out from them", async () => {
    const employee = await anEmployee();
    await aWorkedDay(employee.id);

    const week = await as("hr_manager", () =>
      hrService.timesheetFor(MONDAY, SUNDAY),
    );
    expect(week.rows).toHaveLength(1);
    expect(week.rows[0].minutes).toBe(8 * 60);
    expect(week.totals.minutes).toBe(8 * 60);
  });

  it("refuses to clock somebody in who is already on", async () => {
    const employee = await anEmployee();
    await as("hr_manager", () =>
      hrService.clockIn({ employeeId: employee.id, at: at("2026-01-05T07:00:00") }),
    );

    await expect(
      as("hr_manager", () =>
        hrService.clockIn({ employeeId: employee.id, at: at("2026-01-05T08:00:00") }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses to clock out somebody who is not on", async () => {
    const employee = await anEmployee();
    await expect(
      as("hr_manager", () => hrService.clockOut({ employeeId: employee.id })),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses an end before the start", async () => {
    const employee = await anEmployee();
    await as("hr_manager", () =>
      hrService.clockIn({ employeeId: employee.id, at: at("2026-01-05T07:00:00") }),
    );

    await expect(
      as("hr_manager", () =>
        hrService.clockOut({
          employeeId: employee.id,
          at: at("2026-01-05T06:00:00"),
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("puts a night shift on the day it started", async () => {
    const employee = await anEmployee();
    await aWorkedDay(employee.id, "2026-01-06T18:00:00", "2026-01-07T06:00:00");

    const week = await as("hr_manager", () =>
      hrService.timesheetFor(MONDAY, SUNDAY),
    );
    // Tuesday's work, not Wednesday's — paying it against Wednesday puts half
    // a construction payroll in the wrong week.
    expect(week.rows[0].workedOn).toEqual(new Date("2026-01-06T00:00:00.000Z"));
    expect(week.rows[0].minutes).toBe(11 * 60);
  });

  it("will not book time for somebody who has left", async () => {
    const employee = await anEmployee();
    await as("hr_manager", () =>
      hrService.exitEmployee({
        employeeId: employee.id,
        endedAt: at("2025-12-31T00:00:00"),
        reason: "Resigned.",
      }),
    );

    await expect(
      as("hr_manager", () => hrService.clockIn({ employeeId: employee.id })),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe("who may clock whom", () => {
  it("lets anybody clock themselves in", async () => {
    const employee = await anEmployee({ userId: org.userIds.employee });
    const entry = await as("employee", () =>
      hrService.clockIn({ employeeId: employee.id }),
    );
    expect(entry.clockedOutAt).toBeNull();
  });

  it("does not let them clock somebody else in", async () => {
    await anEmployee({ userId: org.userIds.employee });
    const somebodyElse = await anEmployee({ firstName: "Pieter" });

    await expect(
      as("employee", () => hrService.clockIn({ employeeId: somebodyElse.id })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a supervisor clock in a crew who have no login at all", async () => {
    const boilermaker = await anEmployee();
    const entry = await as("project_manager", () =>
      hrService.clockIn({ employeeId: boilermaker.id }),
    );
    expect(entry.employeeId).toBe(boilermaker.id);
  });

  it("shows somebody with no wider permission only their own week", async () => {
    const mine = await anEmployee({ userId: org.userIds.employee });
    const other = await anEmployee({ firstName: "Pieter" });
    await aWorkedDay(mine.id);
    await aWorkedDay(other.id, "2026-01-05T07:00:00", "2026-01-05T15:00:00");

    const week = await as("employee", () =>
      hrService.timesheetFor(MONDAY, SUNDAY, { employeeId: mine.id }),
    );
    expect(week.rows).toHaveLength(1);
    expect(week.rows[0].name).toBe("Anele Dlamini");

    // And the whole company's week is not theirs to read.
    await expect(
      as("employee", () => hrService.timesheetFor(MONDAY, SUNDAY)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("against the shift that was planned", () => {
  async function onNights() {
    const shift = await as("hr_manager", () =>
      hrService.createShift({
        code: "NIGHT",
        name: "Night shift",
        startsAtMinutes: 18 * 60,
        endsAtMinutes: 6 * 60,
        breakMinutes: 60,
      }),
    );
    const pattern = await as("hr_manager", () =>
      hrService.createWorkPattern({
        code: "NIGHTS",
        name: "Nights",
        cycleDays: 7,
        workingDayIndexes: [0, 1, 2, 3, 4],
        shiftId: shift.id,
        isDefault: true,
      }),
    );
    const employee = await anEmployee();
    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [employee.id],
        workPatternId: pattern.id,
        startsOn: at("2025-12-01T00:00:00"),
      }),
    );
    return employee;
  }

  it("records the shift at clock-in and measures the overtime against it", async () => {
    const employee = await onNights();
    await aWorkedDay(employee.id, "2026-01-06T18:00:00", "2026-01-07T07:30:00");

    const week = await as("hr_manager", () =>
      hrService.timesheetFor(MONDAY, SUNDAY),
    );
    expect(week.rows[0].shiftName).toBe("Night shift");
    expect(week.rows[0].overtime).toBe(90);
    expect(week.totals.overtime).toBe(90);
  });

  it("reports a short day as short rather than as overtime", async () => {
    const employee = await onNights();
    await aWorkedDay(employee.id, "2026-01-06T18:00:00", "2026-01-07T03:00:00");

    const week = await as("hr_manager", () =>
      hrService.timesheetFor(MONDAY, SUNDAY),
    );
    expect(week.rows[0].overtime).toBe(0);
    expect(week.rows[0].undertime).toBe(3 * 60);
  });
});

describe("signing the week off", () => {
  it("is not something the person who worked it may do", async () => {
    const employee = await anEmployee({ userId: org.userIds.employee });
    const entry = await aWorkedDay(employee.id);

    await expect(
      as("employee", () => hrService.approveTimeEntries({ entryIds: [entry.id] })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses an entry that is still running", async () => {
    const employee = await anEmployee();
    const entry = await as("hr_manager", () =>
      hrService.clockIn({ employeeId: employee.id, at: at("2026-01-05T07:00:00") }),
    );

    await expect(
      as("hr_manager", () => hrService.approveTimeEntries({ entryIds: [entry.id] })),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("signs off what is finished, and says how many", async () => {
    const employee = await anEmployee();
    const first = await aWorkedDay(employee.id);
    const second = await aWorkedDay(
      employee.id,
      "2026-01-06T07:00:00",
      "2026-01-06T16:00:00",
    );

    const result = await as("hr_manager", () =>
      hrService.approveTimeEntries({ entryIds: [first.id, second.id] }),
    );
    expect(result.approved).toBe(2);

    const week = await as("hr_manager", () =>
      hrService.timesheetFor(MONDAY, SUNDAY),
    );
    expect(week.totals.awaiting).toBe(0);
    expect(week.rows.every((row) => row.approvedAt !== null)).toBe(true);
  });

  it("does not sign the same entry off twice", async () => {
    const employee = await anEmployee();
    const entry = await aWorkedDay(employee.id);

    await as("hr_manager", () =>
      hrService.approveTimeEntries({ entryIds: [entry.id] }),
    );
    const again = await as("hr_manager", () =>
      hrService.approveTimeEntries({ entryIds: [entry.id] }),
    );
    expect(again.approved).toBe(0);
  });
});

describe("correcting an entry", () => {
  it("is a supervisor's job, not the worker's", async () => {
    const employee = await anEmployee({ userId: org.userIds.employee });
    const entry = await aWorkedDay(employee.id);

    await expect(
      as("employee", () =>
        hrService.correctTimeEntry({
          entryId: entry.id,
          clockedInAt: at("2026-01-05T06:00:00"),
          clockedOutAt: at("2026-01-05T18:00:00"),
          reason: "I was here earlier than that.",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("fixes the times and the day together", async () => {
    const employee = await anEmployee();
    const entry = await aWorkedDay(employee.id);

    await as("hr_manager", () =>
      hrService.correctTimeEntry({
        entryId: entry.id,
        clockedInAt: at("2026-01-06T07:00:00"),
        clockedOutAt: at("2026-01-06T17:00:00"),
        breakMinutes: 60,
        reason: "Recorded against the wrong day.",
      }),
    );

    const week = await as("hr_manager", () =>
      hrService.timesheetFor(MONDAY, SUNDAY),
    );
    expect(week.rows[0].workedOn).toEqual(new Date("2026-01-06T00:00:00.000Z"));
    expect(week.rows[0].minutes).toBe(9 * 60);
  });

  it("refuses to make one overlap another", async () => {
    const employee = await anEmployee();
    await aWorkedDay(employee.id, "2026-01-05T07:00:00", "2026-01-05T12:00:00");
    const second = await aWorkedDay(
      employee.id,
      "2026-01-05T13:00:00",
      "2026-01-05T17:00:00",
    );

    await expect(
      as("hr_manager", () =>
        hrService.correctTimeEntry({
          entryId: second.id,
          clockedInAt: at("2026-01-05T11:00:00"),
          clockedOutAt: at("2026-01-05T17:00:00"),
          reason: "Nobody is at work twice at once.",
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses to edit an entry payroll has been run against", async () => {
    const employee = await anEmployee();
    const entry = await aWorkedDay(employee.id);
    await as("hr_manager", () =>
      hrService.approveTimeEntries({ entryIds: [entry.id] }),
    );

    await expect(
      as("hr_manager", () =>
        hrService.correctTimeEntry({
          entryId: entry.id,
          clockedInAt: at("2026-01-05T05:00:00"),
          clockedOutAt: at("2026-01-05T19:00:00"),
          reason: "Making the week look better.",
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    // Withdrawing the approval is a deliberate act, and then it can be fixed.
    await as("hr_manager", () => hrService.withdrawApproval(entry.id));
    const fixed = await as("hr_manager", () =>
      hrService.correctTimeEntry({
        entryId: entry.id,
        clockedInAt: at("2026-01-05T06:00:00"),
        clockedOutAt: at("2026-01-05T16:00:00"),
        breakMinutes: 60,
        reason: "Gate log says 06:00.",
      }),
    );
    expect(fixed.clockedInAt).toEqual(at("2026-01-05T06:00:00"));
  });
});

describe("who is on the clock", () => {
  it("lists them with how long they have been on", async () => {
    const employee = await anEmployee();
    await as("hr_manager", () => hrService.clockIn({ employeeId: employee.id }));

    const on = await as("hr_manager", () => hrService.whoIsOnTheClock());
    expect(on).toHaveLength(1);
    expect(on[0].name).toBe("Anele Dlamini");
  });

  it("flags one that has run longer than anybody works", async () => {
    const employee = await anEmployee();
    await as("hr_manager", () =>
      hrService.clockIn({
        employeeId: employee.id,
        at: new Date(Date.now() - 20 * 3600_000),
      }),
    );

    const on = await as("hr_manager", () => hrService.whoIsOnTheClock());
    expect(on[0].looksForgotten).toBe(true);
  });

  it("is one tenant's business and nobody else's", async () => {
    const employee = await anEmployee();
    await as("hr_manager", () => hrService.clockIn({ employeeId: employee.id }));

    const other = await seedOrganisation("Kgosi Civils");
    const theirs = await withRequestContext(
      { organisationId: other.organisationId, userId: other.userIds.hr_manager },
      () => hrService.whoIsOnTheClock(),
    );
    expect(theirs).toHaveLength(0);
  });
});
