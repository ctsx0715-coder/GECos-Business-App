import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError } from "@/lib/errors";
import { hrService, workingDaysBetween } from "@/modules/hr/hr.service";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * HR rules, weighted towards leave.
 *
 * The people register is ordinary CRUD on proven rails and gets light cover.
 * Leave is where the arithmetic is, and a leave balance that is quietly wrong
 * is the kind of bug someone discovers in December when they are told they
 * have no days left.
 */

let org: SeededOrg;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

/*
 * Dates are relative to today rather than pinned to a year.
 *
 * Leave cannot normally be booked in the past, so fixed dates would pass until
 * the calendar caught up with them and then fail for a reason that has nothing
 * to do with the code. `monday(n)` returns the Monday at least n weeks out.
 */
function monday(weeksOut: number): Date {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() + weeksOut * 7);
  // 0 is Sunday, so this lands on the following Monday either way.
  day.setUTCDate(day.getUTCDate() + ((8 - day.getUTCDay()) % 7 || 7));
  return day;
}

/** n days after a given date, calendar days. */
function plus(from: Date, days: number): Date {
  const day = new Date(from);
  day.setUTCDate(day.getUTCDate() + days);
  return day;
}

/** A cycle wide enough to contain every date these tests use. */
const CYCLE_START = plus(new Date(), -365);
const CYCLE_END = plus(new Date(), 365);

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
      jobTitle: "Site Supervisor",
      startedAt: new Date("2024-03-01T00:00:00Z"),
      ...overrides,
    }),
  );
}

async function annualLeave(daysPerCycle: number | null = 21) {
  return as("hr_manager", () =>
    hrService.createLeaveType({
      code: daysPerCycle === null ? "UNPAID" : "ANNUAL",
      name: daysPerCycle === null ? "Unpaid leave" : "Annual leave",
      daysPerCycle,
      isPaid: daysPerCycle !== null,
    }),
  );
}

async function withBalance(
  employeeId: string,
  leaveTypeId: string,
  entitledDays: number,
) {
  return as("hr_manager", () =>
    hrService.setBalance({
      employeeId,
      leaveTypeId,
      cycleStartsAt: CYCLE_START,
      cycleEndsAt: CYCLE_END,
      entitledDays,
    }),
  );
}

describe("counting working days", () => {
  it("excludes weekends", () => {
    // Monday 1 June 2026 to Friday 5 June: five days.
    expect(
      workingDaysBetween(new Date("2026-06-01"), new Date("2026-06-05")),
    ).toBe(5);

    // Spanning a weekend adds calendar days but not working days.
    expect(
      workingDaysBetween(new Date("2026-06-01"), new Date("2026-06-08")),
    ).toBe(6);
  });

  it("counts a single day as one, and a weekend as none", () => {
    expect(
      workingDaysBetween(new Date("2026-06-03"), new Date("2026-06-03")),
    ).toBe(1);
    // Saturday and Sunday.
    expect(
      workingDaysBetween(new Date("2026-06-06"), new Date("2026-06-07")),
    ).toBe(0);
  });
});

describe("the people register", () => {
  it("allocates an employee number and starts active", async () => {
    const employee = await anEmployee();
    expect(employee.employeeNumber).toMatch(/^EMP-\d{4}-\d{4}$/);
    expect(employee.status).toBe("ACTIVE");
  });

  it("refuses to let someone report to themselves", async () => {
    const employee = await anEmployee();
    await expect(
      as("hr_manager", () =>
        hrService.updateEmployee(employee.id, { managerId: employee.id }),
      ),
    ).rejects.toThrow(/cannot report to themselves/);
  });

  it("keeps an exited employee's record and cancels their future leave", async () => {
    const employee = await anEmployee();
    const type = await annualLeave();
    await withBalance(employee.id, type.id, 21);

    const future = await as("hr_manager", () =>
      hrService.requestLeave({
        employeeId: employee.id,
        leaveTypeId: type.id,
        startsAt: monday(6),
        endsAt: plus(monday(6), 4),
      }),
    );

    await as("hr_manager", () =>
      hrService.exitEmployee({
        employeeId: employee.id,
        endedAt: plus(monday(6), -7),
        reason: "Resigned.",
      }),
    );

    const after = await as("hr_manager", () => hrService.getEmployee(employee.id));
    expect(after.status).toBe("EXITED");
    expect(after.deletedAt).toBeNull();

    const cancelled = after.leaveRequests.find((r) => r.id === future.id);
    expect(cancelled?.status).toBe("CANCELLED");
  });

  it("will not book leave for someone who has left", async () => {
    const employee = await anEmployee();
    const type = await annualLeave();
    await withBalance(employee.id, type.id, 21);
    await as("hr_manager", () =>
      hrService.exitEmployee({
        employeeId: employee.id,
        endedAt: plus(monday(6), -7),
        reason: "Resigned.",
      }),
    );

    await expect(
      as("hr_manager", () =>
        hrService.requestLeave({
          employeeId: employee.id,
          leaveTypeId: type.id,
          startsAt: monday(6),
          endsAt: plus(monday(6), 1),
        }),
      ),
    ).rejects.toThrow(/has left/);
  });
});

describe("requesting leave", () => {
  it("spends the balance at submission, not at approval", async () => {
    const employee = await anEmployee();
    const type = await annualLeave(21);
    await withBalance(employee.id, type.id, 21);

    await as("hr_manager", () =>
      hrService.requestLeave({
        employeeId: employee.id,
        leaveTypeId: type.id,
        startsAt: monday(4),
        endsAt: plus(monday(4), 4),
      }),
    );

    const balances = await as("hr_manager", () =>
      hrService.balancesFor(employee.id),
    );
    // Undecided, but the five days are already committed — otherwise the same
    // fortnight can be submitted three times and granted by three managers.
    expect(balances[0].takenDays).toBe(5);
    expect(balances[0].remainingDays).toBe(16);
  });

  it("refuses a request larger than what remains", async () => {
    const employee = await anEmployee();
    const type = await annualLeave(21);
    await withBalance(employee.id, type.id, 3);

    await expect(
      as("hr_manager", () =>
        hrService.requestLeave({
          employeeId: employee.id,
          leaveTypeId: type.id,
          startsAt: monday(4),
          endsAt: plus(monday(4), 4),
        }),
      ),
    ).rejects.toThrow(/only 3 remain/);
  });

  it("refuses a request with no balance set for the period", async () => {
    const employee = await anEmployee();
    const type = await annualLeave(21);

    await expect(
      as("hr_manager", () =>
        hrService.requestLeave({
          employeeId: employee.id,
          leaveTypeId: type.id,
          startsAt: monday(4),
          endsAt: plus(monday(4), 1),
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses leave that overlaps leave already booked", async () => {
    const employee = await anEmployee();
    const type = await annualLeave(21);
    await withBalance(employee.id, type.id, 21);

    await as("hr_manager", () =>
      hrService.requestLeave({
        employeeId: employee.id,
        leaveTypeId: type.id,
        startsAt: monday(4),
        endsAt: plus(monday(4), 4),
      }),
    );

    await expect(
      as("hr_manager", () =>
        hrService.requestLeave({
          employeeId: employee.id,
          leaveTypeId: type.id,
          startsAt: plus(monday(4), 3),
          endsAt: plus(monday(4), 8),
        }),
      ),
    ).rejects.toThrow(/overlaps leave already booked/);
  });

  it("needs no balance for an uncapped type", async () => {
    const employee = await anEmployee();
    const unpaid = await annualLeave(null);

    const request = await as("hr_manager", () =>
      hrService.requestLeave({
        employeeId: employee.id,
        leaveTypeId: unpaid.id,
        startsAt: monday(4),
        endsAt: plus(monday(4), 1),
      }),
    );

    expect(Number(request.days)).toBe(2);
  });

  it("refuses a range containing no working days", async () => {
    const employee = await anEmployee();
    const type = await annualLeave(21);
    await withBalance(employee.id, type.id, 21);

    await expect(
      as("hr_manager", () =>
        hrService.requestLeave({
          employeeId: employee.id,
          leaveTypeId: type.id,
          // The Saturday and Sunday before that Monday.
          startsAt: plus(monday(4), -2),
          endsAt: plus(monday(4), -1),
        }),
      ),
    ).rejects.toThrow(/no working days/);
  });
});

describe("deciding leave", () => {
  /** An employee who is also a signed-in user, so they can act on their own. */
  async function selfServiceEmployee() {
    const employee = await anEmployee({ userId: org.userIds.project_manager });
    const type = await annualLeave(21);
    await withBalance(employee.id, type.id, 21);
    const request = await as("project_manager", () =>
      hrService.requestLeave({
        employeeId: employee.id,
        leaveTypeId: type.id,
        startsAt: monday(4),
        endsAt: plus(monday(4), 4),
      }),
    );
    return { employee, type, request };
  }

  it("refuses to let anyone approve their own leave", async () => {
    const { request } = await selfServiceEmployee();

    const attempt = as("project_manager", () =>
      hrService.decideLeave({ requestId: request.id, decision: "APPROVED" }),
    );

    await expect(attempt).rejects.toThrow(/cannot approve your own leave/);
    // The class matters: an AppError becomes a refusal the screen renders,
    // anything else becomes a crash page.
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a different approver decide", async () => {
    const { request } = await selfServiceEmployee();

    const decided = await as("hr_manager", () =>
      hrService.decideLeave({ requestId: request.id, decision: "APPROVED" }),
    );

    expect(decided.status).toBe("APPROVED");
    expect(decided.decidedById).toBe(org.userIds.hr_manager);
  });

  it("hands the days back when a request is rejected", async () => {
    const { employee, request } = await selfServiceEmployee();

    await as("hr_manager", () =>
      hrService.decideLeave({
        requestId: request.id,
        decision: "REJECTED",
        comment: "Site is short-handed that week.",
      }),
    );

    const balances = await as("hr_manager", () =>
      hrService.balancesFor(employee.id),
    );
    expect(balances[0].takenDays).toBe(0);
    expect(balances[0].remainingDays).toBe(21);
  });

  it("hands the days back when a request is cancelled", async () => {
    const { employee, request } = await selfServiceEmployee();

    await as("project_manager", () =>
      hrService.cancelLeave({ requestId: request.id, reason: "No longer needed." }),
    );

    const balances = await as("hr_manager", () =>
      hrService.balancesFor(employee.id),
    );
    expect(balances[0].takenDays).toBe(0);
  });

  it("refuses to decide the same request twice", async () => {
    const { request } = await selfServiceEmployee();
    await as("hr_manager", () =>
      hrService.decideLeave({ requestId: request.id, decision: "APPROVED" }),
    );

    await expect(
      as("hr_manager", () =>
        hrService.decideLeave({ requestId: request.id, decision: "REJECTED" }),
      ),
    ).rejects.toThrow(/already been decided/);
  });
});

describe("permissions and tenancy", () => {
  it("refuses the register to someone without the permission", async () => {
    await expect(
      as("employee", () => hrService.listEmployees()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps one tenant's employees invisible to another", async () => {
    await anEmployee();
    const other = await seedOrganisation("Kgosi Civils");

    const theirs = await withRequestContext(
      { organisationId: other.organisationId, userId: other.userIds.hr_manager },
      () => hrService.listEmployees(),
    );

    expect(theirs).toHaveLength(0);
  });
});

describe("adjusting a balance", () => {
  it("adds days to the cycle in progress", async () => {
    const employee = await anEmployee();
    const type = await annualLeave(15);

    await as("hr_manager", () =>
      hrService.adjustBalance({
        employeeId: employee.id,
        leaveTypeId: type.id,
        days: 3,
        reason: "Worked the Freedom Day public holiday.",
      }),
    );

    const [balance] = await as("hr_manager", () =>
      hrService.balancesFor(employee.id),
    );
    expect(balance.entitledDays).toBe(3);
    expect(balance.remainingDays).toBe(3);
  });

  it("takes days back, and refuses to take back days already spent", async () => {
    const employee = await anEmployee();
    const type = await annualLeave(15);

    await as("hr_manager", () =>
      hrService.adjustBalance({
        employeeId: employee.id,
        leaveTypeId: type.id,
        days: 5,
        reason: "Opening entitlement.",
      }),
    );
    await as("hr_manager", () =>
      hrService.adjustBalance({
        employeeId: employee.id,
        leaveTypeId: type.id,
        days: -2,
        reason: "Recorded twice.",
      }),
    );

    const [balance] = await as("hr_manager", () =>
      hrService.balancesFor(employee.id),
    );
    expect(balance.entitledDays).toBe(3);

    await expect(
      as("hr_manager", () =>
        hrService.adjustBalance({
          employeeId: employee.id,
          leaveTypeId: type.id,
          days: -10,
          reason: "Too far.",
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("is not something an ordinary employee may do", async () => {
    const employee = await anEmployee();
    const type = await annualLeave(15);

    await expect(
      as("employee", () =>
        hrService.adjustBalance({
          employeeId: employee.id,
          leaveTypeId: type.id,
          days: 30,
          reason: "A generous afternoon.",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("running accrual", () => {
  async function accruingType() {
    return as("hr_manager", () =>
      hrService.createLeaveType({
        code: "ANNUAL",
        name: "Annual leave",
        daysPerCycle: 15,
        accrualMethod: "MONTHLY_ACCRUAL",
        accrualDaysPerPeriod: 1.25,
      }),
    );
  }

  it("creates the balance it needs and credits the months worked", async () => {
    // Started before this cycle, so every completed month of it has been
    // earned by the time the run happens in July.
    const employee = await anEmployee({ startedAt: new Date("2020-01-06T00:00:00Z") });
    await accruingType();

    const asOf = new Date(Date.UTC(new Date().getUTCFullYear(), 6, 1));
    const summary = await as("hr_manager", () => hrService.runAccrual({ asOf }));

    expect(summary.balancesCreated).toBe(1);
    expect(summary.daysCredited).toBe(7.5); // Six completed months.

    const [balance] = await as("hr_manager", () =>
      hrService.balancesFor(employee.id),
    );
    expect(balance.entitledDays).toBe(7.5);
  });

  it("changes nothing when run a second time", async () => {
    await anEmployee({ startedAt: new Date("2020-01-06T00:00:00Z") });
    await accruingType();
    const asOf = new Date(Date.UTC(new Date().getUTCFullYear(), 6, 1));

    await as("hr_manager", () => hrService.runAccrual({ asOf }));
    const second = await as("hr_manager", () => hrService.runAccrual({ asOf }));

    expect(second.daysCredited).toBe(0);
    expect(second.balancesCredited).toBe(0);
  });

  it("leaves manual types alone", async () => {
    const employee = await anEmployee({ startedAt: new Date("2020-01-06T00:00:00Z") });
    await annualLeave(15); // Defaults to MANUAL.

    const summary = await as("hr_manager", () => hrService.runAccrual());
    expect(summary.daysCredited).toBe(0);
    expect(await as("hr_manager", () => hrService.balancesFor(employee.id))).toHaveLength(0);
  });

  it("does not credit somebody who has left", async () => {
    const employee = await anEmployee({ startedAt: new Date("2020-01-06T00:00:00Z") });
    await accruingType();

    await as("hr_manager", () =>
      hrService.exitEmployee({
        employeeId: employee.id,
        endedAt: new Date(),
        reason: "Resigned.",
      }),
    );

    const summary = await as("hr_manager", () => hrService.runAccrual());
    expect(summary.balancesCreated).toBe(0);
    expect(summary.daysCredited).toBe(0);
  });

  it("refuses a leave type that could never credit anything", async () => {
    await expect(
      as("hr_manager", () =>
        hrService.createLeaveType({
          code: "STUDY",
          name: "Study leave",
          daysPerCycle: 5,
          accrualMethod: "MONTHLY_ACCRUAL",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("certifications", () => {
  it("records a ticket against a person and lists it", async () => {
    const employee = await anEmployee();

    await as("hr_manager", () =>
      hrService.addCertification({
        employeeId: employee.id,
        requirementName: "Working at heights",
        category: "TRAINING",
        expiresAt: new Date("2027-03-01T00:00:00Z"),
      }),
    );

    const certifications = await as("hr_manager", () =>
      hrService.certificationsFor(employee.id),
    );
    expect(certifications).toHaveLength(1);
    expect(certifications[0].requirementName).toBe("Working at heights");
  });

  it("keeps a certification that never expires", async () => {
    const employee = await anEmployee();
    await as("hr_manager", () =>
      hrService.addCertification({
        employeeId: employee.id,
        requirementName: "Trade test certificate",
        category: "TRAINING",
      }),
    );

    const certifications = await as("hr_manager", () =>
      hrService.certificationsFor(employee.id),
    );
    expect(certifications[0].expiresAt).toBeNull();
  });

  it("refuses one that expires before it was issued", async () => {
    const employee = await anEmployee();
    await expect(
      as("hr_manager", () =>
        hrService.addCertification({
          employeeId: employee.id,
          requirementName: "Medical certificate of fitness",
          category: "MEDICAL",
          issuedAt: new Date("2026-06-01T00:00:00Z"),
          expiresAt: new Date("2026-01-01T00:00:00Z"),
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("removes one without destroying the record", async () => {
    const employee = await anEmployee();
    const certification = await as("hr_manager", () =>
      hrService.addCertification({
        employeeId: employee.id,
        requirementName: "Forklift licence",
        category: "LICENCE",
        expiresAt: new Date("2027-01-01T00:00:00Z"),
      }),
    );

    await as("hr_manager", () =>
      hrService.removeCertification({ certificationId: certification.id }),
    );

    expect(
      await as("hr_manager", () => hrService.certificationsFor(employee.id)),
    ).toHaveLength(0);

    const row = await rawDb.complianceItem.findUnique({
      where: { id: certification.id },
    });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("is not something a tender officer may write", async () => {
    const employee = await anEmployee();
    await expect(
      as("tender_officer", () =>
        hrService.addCertification({
          employeeId: employee.id,
          requirementName: "Anything at all",
          category: "TRAINING",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
