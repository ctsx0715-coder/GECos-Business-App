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
 * A pay period, assembled.
 *
 * The split arithmetic is tested without a database in `payroll.test.ts`
 * beside the module. What needs one is what goes into it: only signed-off
 * time, two clock-ins on one day counted as one day, a six-day worker's
 * shorter ordinary day, and the export refusing to be read by somebody who
 * may run a timesheet but not a pay run.
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

const FROM = new Date("2026-01-05T00:00:00.000Z");
const TO = new Date("2026-01-11T00:00:00.000Z");

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
      department: "Workshop",
      startedAt: at("2024-01-01T00:00:00"),
      ...overrides,
    }),
  );
}

/** Clocks a stretch and signs it off, which is the only kind payroll counts. */
async function aSignedDay(employeeId: string, from: string, to: string) {
  await as("hr_manager", () => hrService.clockIn({ employeeId, at: at(from) }));
  const entry = await as("hr_manager", () =>
    hrService.clockOut({ employeeId, at: at(to), breakMinutes: 60 }),
  );
  await as("hr_manager", () =>
    hrService.approveTimeEntries({ entryIds: [entry.id] }),
  );
  return entry;
}

async function anUnsignedDay(employeeId: string, from: string, to: string) {
  await as("hr_manager", () => hrService.clockIn({ employeeId, at: at(from) }));
  return as("hr_manager", () =>
    hrService.clockOut({ employeeId, at: at(to), breakMinutes: 60 }),
  );
}

describe("what goes into a pay period", () => {
  it("counts signed-off time and splits it", async () => {
    const employee = await anEmployee();
    // 07:00 to 18:00 less an hour: ten hours, one of them overtime.
    await aSignedDay(employee.id, "2026-01-05T07:00:00", "2026-01-05T18:00:00");

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    const [person] = period.people;

    expect(person.ordinary).toBe(9 * 60);
    expect(person.overtime).toBe(60);
    expect(person.total).toBe(10 * 60);
  });

  it("leaves out what nobody has signed for, and says how much", async () => {
    const employee = await anEmployee();
    await aSignedDay(employee.id, "2026-01-05T07:00:00", "2026-01-05T16:00:00");
    await anUnsignedDay(employee.id, "2026-01-06T07:00:00", "2026-01-06T16:00:00");

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    const [person] = period.people;

    // Eight hours counted, eight reported as missing rather than silently
    // folded in — paying from an unapproved entry makes the sign-off theatre.
    expect(person.ordinary).toBe(8 * 60);
    expect(person.unsignedMinutes).toBe(8 * 60);
    expect(person.unsignedEntries).toBe(1);
    expect(period.totals.unsignedEntries).toBe(1);
  });

  it("counts two clock-ins on one day as one day", async () => {
    const employee = await anEmployee();
    await aSignedDay(employee.id, "2026-01-05T06:00:00", "2026-01-05T12:00:00");
    await aSignedDay(employee.id, "2026-01-05T13:00:00", "2026-01-05T19:00:00");

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    const [person] = period.people;

    // Five plus five is ten hours in the day, so one hour is overtime. Split
    // per entry it would have been ten ordinary hours and no overtime at all.
    expect(person.total).toBe(10 * 60);
    expect(person.ordinary).toBe(9 * 60);
    expect(person.overtime).toBe(60);
  });

  it("ignores somebody who worked nothing in the period", async () => {
    await anEmployee();
    await anEmployee({ firstName: "Pieter" });

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    expect(period.people).toHaveLength(0);
  });

  it("puts a Sunday in the Sunday column", async () => {
    const employee = await anEmployee();
    await aSignedDay(employee.id, "2026-01-11T07:00:00", "2026-01-11T16:00:00");

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    const [person] = period.people;

    expect(person.sunday).toBe(8 * 60);
    expect(person.ordinary).toBe(0);
  });

  it("puts a public holiday in the holiday column", async () => {
    const employee = await anEmployee();
    await as("hr_manager", () =>
      hrService.addHoliday({
        observedOn: new Date("2026-01-06T00:00:00.000Z"),
        name: "Founder's day",
      }),
    );
    await aSignedDay(employee.id, "2026-01-06T07:00:00", "2026-01-06T16:00:00");

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    expect(period.people[0].holiday).toBe(8 * 60);
  });
});

describe("the ordinary day somebody is measured against", () => {
  async function onASixDayWeek() {
    const pattern = await as("hr_manager", () =>
      hrService.createWorkPattern({
        code: "SITE_6DAY",
        name: "Six-day week",
        cycleDays: 7,
        workingDayIndexes: [0, 1, 2, 3, 4, 5],
        isDefault: true,
      }),
    );
    const employee = await anEmployee();
    await as("hr_manager", () =>
      hrService.assignPatterns({
        employeeIds: [employee.id],
        workPatternId: pattern.id,
        startsOn: new Date("2025-12-01T00:00:00.000Z"),
      }),
    );
    return employee;
  }

  it("is eight hours for a six-day week, not nine", async () => {
    const employee = await onASixDayWeek();
    await aSignedDay(employee.id, "2026-01-05T07:00:00", "2026-01-05T16:00:00");

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    const [person] = period.people;

    expect(person.workingDaysPerWeek).toBe(6);
    expect(person.ordinary).toBe(8 * 60);
    expect(person.overtime).toBe(0);
  });

  it("moves the hours past forty-five in a week into overtime", async () => {
    const employee = await onASixDayWeek();
    for (const day of ["05", "06", "07", "08", "09", "10"]) {
      await aSignedDay(
        employee.id,
        `2026-01-${day}T07:00:00`,
        `2026-01-${day}T16:00:00`,
      );
    }

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    const [person] = period.people;

    // Six eight-hour days is 48, and no single day broke the daily ceiling.
    expect(person.total).toBe(48 * 60);
    expect(person.ordinary).toBe(45 * 60);
    expect(person.overtime).toBe(3 * 60);
  });
});

describe("what the BCEA does not allow", () => {
  it("is reported without withholding the hours", async () => {
    const employee = await anEmployee();
    await aSignedDay(employee.id, "2026-01-05T05:00:00", "2026-01-05T19:00:00");

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    const [person] = period.people;

    expect(person.breaches).toHaveLength(1);
    expect(person.breaches[0].kind).toBe("DAILY_OVERTIME");
    expect(person.total).toBe(13 * 60);
    expect(period.totals.breaches).toBe(1);
  });
});

describe("the rules themselves", () => {
  it("start as the BCEA's numbers without anybody writing them", async () => {
    const policy = await as("hr_manager", () => hrService.payrollPolicy());

    expect(policy.ordinaryMinutesPerDayShortWeek).toBe(540);
    expect(policy.ordinaryMinutesPerWeek).toBe(2700);
    expect(Number(policy.overtimeMultiplier)).toBe(1.5);
  });

  it("can be raised, and the split follows", async () => {
    const employee = await anEmployee();
    await aSignedDay(employee.id, "2026-01-05T07:00:00", "2026-01-05T16:00:00");

    await as("hr_manager", () =>
      hrService.updatePayrollPolicy({
        ordinaryMinutesPerDayShortWeek: 7 * 60,
        ordinaryMinutesPerDayLongWeek: 7 * 60,
        ordinaryMinutesPerWeek: 40 * 60,
        maxOvertimeMinutesPerDay: 180,
        maxOvertimeMinutesPerWeek: 600,
        overtimeMultiplier: 1.75,
        sundayMultiplier: 2,
        holidayMultiplier: 2,
      }),
    );

    const period = await as("hr_manager", () => hrService.payrollFor(FROM, TO));
    const [person] = period.people;

    // A seven-hour ordinary day turns the same eight-hour shift into an hour
    // of overtime, which is the point of the numbers being rows.
    expect(person.ordinary).toBe(7 * 60);
    expect(person.overtime).toBe(60);
    expect(period.policy.overtimeMultiplier).toBe(1.75);
  });
});

describe("who may run it", () => {
  it("is not the person who worked the hours", async () => {
    await anEmployee({ userId: org.userIds.employee });
    await expect(
      as("employee", () => hrService.payrollFor(FROM, TO)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("is not a supervisor who only signs timesheets off", async () => {
    // The project manager approves a week; running the pay run is a different
    // job and a different permission.
    await expect(
      as("project_manager", () => hrService.payrollFor(FROM, TO)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("is the finance manager, who cannot read the people register", async () => {
    const employee = await anEmployee();
    await aSignedDay(employee.id, "2026-01-05T07:00:00", "2026-01-05T16:00:00");

    const period = await as("finance_manager", () =>
      hrService.payrollFor(FROM, TO),
    );
    expect(period.people).toHaveLength(1);

    await expect(
      as("finance_manager", () => hrService.listEmployees()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps one tenant's hours out of another's pay run", async () => {
    const employee = await anEmployee();
    await aSignedDay(employee.id, "2026-01-05T07:00:00", "2026-01-05T16:00:00");

    const other = await seedOrganisation("Kgosi Civils");
    const theirs = await withRequestContext(
      { organisationId: other.organisationId, userId: other.userIds.hr_manager },
      () => hrService.payrollFor(FROM, TO),
    );
    expect(theirs.people).toHaveLength(0);
  });
});
