import { nextReference } from "@/lib/database/reference-numbers";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { requirePermission, hasPermission } from "@/lib/permissions";
import {
  cancelLeaveSchema,
  createEmployeeSchema,
  createLeaveTypeSchema,
  decideLeaveSchema,
  exitEmployeeSchema,
  requestLeaveSchema,
  setBalanceSchema,
  updateEmployeeSchema,
} from "@/schemas/hr.schema";
import type { EmployeeStatus, LeaveRequestStatus } from "@/generated/prisma/client";
import { hrRepository } from "./hr.repository";

/**
 * HR business logic.
 *
 * What this module deliberately does not do is decide how much leave anyone
 * gets. South African entitlement is the BCEA as a floor, raised by whichever
 * bargaining council or company policy applies, and which of those bind Nopedi
 * is still an open question (docs/02-discovery-questions.md). So entitlement
 * lives in rows an administrator writes, and the code here only ever spends
 * against a balance it was given. When the real rules arrive they fill the
 * ledger; none of the logic below changes.
 */

/**
 * Working days between two dates, inclusive.
 *
 * Weekends are excluded. South African public holidays are not, because the
 * Public Holidays Act moves a holiday falling on a Sunday to the Monday and
 * Nopedi may also close over a builders' shutdown that is not statutory at
 * all. Guessing produces leave balances that are quietly wrong, which is worse
 * than a count anyone can check — so the gap is named here and in the request
 * screen rather than papered over.
 */
export function workingDaysBetween(startsAt: Date, endsAt: Date): number {
  const start = new Date(
    Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(endsAt.getUTCFullYear(), endsAt.getUTCMonth(), endsAt.getUTCDate()),
  );
  if (end < start) return 0;

  let days = 0;
  for (const day = start; day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

export interface LeaveBalanceView {
  leaveTypeId: string;
  leaveTypeName: string;
  entitledDays: number;
  broughtForwardDays: number;
  takenDays: number;
  remainingDays: number;
  /** Uncapped types — unpaid leave — have no meaningful remainder. */
  isUncapped: boolean;
}

export const hrService = {
  // -- People ---------------------------------------------------------------

  async listEmployees(status?: EmployeeStatus[]) {
    await requirePermission("hr.employee.view");
    return hrRepository.listEmployees(status);
  },

  async getEmployee(id: string) {
    await requirePermission("hr.employee.view");
    const employee = await hrRepository.findEmployee(id);
    if (!employee) throw new NotFoundError("Employee");
    return employee;
  },

  async createEmployee(input: unknown) {
    await requirePermission("hr.employee.create");
    const data = createEmployeeSchema.parse(input);

    if (data.managerId) {
      const manager = await hrRepository.findEmployee(data.managerId);
      if (!manager) throw new NotFoundError("Manager");
    }

    return hrRepository.createEmployee({
      employeeNumber: await nextReference("EMP"),
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone,
      nationalId: data.nationalId,
      jobTitle: data.jobTitle,
      department: data.department,
      managerId: data.managerId,
      userId: data.userId,
      employmentType: data.employmentType,
      startedAt: data.startedAt,
    });
  },

  async updateEmployee(id: string, input: unknown) {
    await requirePermission("hr.employee.edit");
    const data = updateEmployeeSchema.parse(input);

    if (data.managerId === id) {
      throw new BusinessRuleError("Someone cannot report to themselves.");
    }

    const employee = await hrRepository.findEmployee(id);
    if (!employee) throw new NotFoundError("Employee");

    return hrRepository.updateEmployee(id, {
      ...data,
      email: data.email === "" ? null : data.email,
    });
  },

  /**
   * Ending someone's employment.
   *
   * Their leave requests in the future are cancelled, because leave granted
   * for a period after the last day is not leave. The record itself stays:
   * employment records carry statutory retention, and an exit is a status
   * change rather than a deletion.
   */
  async exitEmployee(input: unknown) {
    await requirePermission("hr.employee.exit");
    const data = exitEmployeeSchema.parse(input);

    const employee = await hrRepository.findEmployee(data.employeeId);
    if (!employee) throw new NotFoundError("Employee");
    if (employee.status === "EXITED") {
      throw new BusinessRuleError("That employee has already been exited.");
    }
    if (data.endedAt < employee.startedAt) {
      throw new BusinessRuleError("The last day is before the first day.");
    }

    for (const request of employee.leaveRequests) {
      const isFuture = request.startsAt > data.endedAt;
      const isLive = request.status === "SUBMITTED" || request.status === "APPROVED";
      if (isFuture && isLive) {
        await hrRepository.updateLeaveRequest(request.id, {
          status: "CANCELLED",
          decisionComment: "Cancelled automatically when the employee exited.",
        });
      }
    }

    return hrRepository.updateEmployee(data.employeeId, {
      status: "EXITED",
      endedAt: data.endedAt,
      exitReason: data.reason,
    });
  },

  // -- Leave configuration --------------------------------------------------

  async listLeaveTypes(includeInactive = false) {
    return hrRepository.listLeaveTypes(includeInactive);
  },

  async createLeaveType(input: unknown) {
    await requirePermission("hr.leave.configure");
    const data = createLeaveTypeSchema.parse(input);
    return hrRepository.createLeaveType({
      code: data.code,
      name: data.name,
      description: data.description,
      daysPerCycle: data.daysPerCycle ?? null,
      isPaid: data.isPaid,
      carryOverMaxDays: data.carryOverMaxDays ?? null,
      documentRequiredAfterDays: data.documentRequiredAfterDays ?? null,
      allowsBackdating: data.allowsBackdating,
      sortOrder: data.sortOrder,
    });
  },

  async setBalance(input: unknown) {
    await requirePermission("hr.leave.configure");
    const data = setBalanceSchema.parse(input);

    if (data.cycleEndsAt <= data.cycleStartsAt) {
      throw new BusinessRuleError("The cycle ends before it starts.");
    }

    const employee = await hrRepository.findEmployee(data.employeeId);
    if (!employee) throw new NotFoundError("Employee");

    const leaveType = await hrRepository.findLeaveType(data.leaveTypeId);
    if (!leaveType) throw new NotFoundError("Leave type");

    return hrRepository.upsertBalance(
      {
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        cycleStartsAt: data.cycleStartsAt,
      },
      {
        cycleEndsAt: data.cycleEndsAt,
        entitledDays: data.entitledDays,
        broughtForwardDays: data.broughtForwardDays,
      },
    );
  },

  async balancesFor(employeeId: string): Promise<LeaveBalanceView[]> {
    await this.assertMaySeeEmployee(employeeId);
    const balances = await hrRepository.balancesFor(employeeId);

    return balances.map((balance) => {
      const entitled = Number(balance.entitledDays);
      const broughtForward = Number(balance.broughtForwardDays);
      const taken = Number(balance.takenDays);
      return {
        leaveTypeId: balance.leaveTypeId,
        leaveTypeName: balance.leaveType.name,
        entitledDays: entitled,
        broughtForwardDays: broughtForward,
        takenDays: taken,
        remainingDays: entitled + broughtForward - taken,
        isUncapped: balance.leaveType.daysPerCycle === null,
      };
    });
  },

  // -- Leave requests -------------------------------------------------------

  async listLeaveRequests(filter?: {
    status?: LeaveRequestStatus[];
    employeeId?: string;
  }) {
    // Your own leave needs no permission; anyone else's does.
    const mine = await this.myEmployeeId();
    if (!filter?.employeeId || filter.employeeId !== mine) {
      await requirePermission("hr.leave.view");
    }
    return hrRepository.listLeaveRequests(filter);
  },

  /**
   * Submitting a leave request.
   *
   * The balance is spent at submission rather than at approval. Checking only
   * on approval lets someone submit the same fortnight three times and have
   * all three granted by three different managers who each saw a healthy
   * balance.
   */
  async requestLeave(input: unknown) {
    const data = requestLeaveSchema.parse(input);

    const mine = await this.myEmployeeId();
    if (data.employeeId !== mine) {
      // Booking leave on someone else's behalf is an HR action.
      await requirePermission("hr.leave.configure");
    } else {
      await requirePermission("hr.leave.request");
    }

    const employee = await hrRepository.findEmployee(data.employeeId);
    if (!employee) throw new NotFoundError("Employee");
    if (employee.status === "EXITED") {
      throw new BusinessRuleError(
        "That employee has left. Leave cannot be booked after an exit date.",
      );
    }

    const leaveType = await hrRepository.findLeaveType(data.leaveTypeId);
    if (!leaveType) throw new NotFoundError("Leave type");

    const days = workingDaysBetween(data.startsAt, data.endsAt);
    if (days === 0) {
      throw new BusinessRuleError(
        "That range contains no working days. Weekends do not need to be booked.",
      );
    }

    if (!leaveType.allowsBackdating && data.startsAt < startOfToday()) {
      throw new BusinessRuleError(
        `${leaveType.name} cannot be booked for a date that has already passed.`,
      );
    }

    const clashes = await hrRepository.overlappingRequests(
      data.employeeId,
      data.startsAt,
      data.endsAt,
    );
    if (clashes.length > 0) {
      throw new BusinessRuleError(
        `That overlaps leave already booked (${clashes[0].leaveType.name}).`,
      );
    }

    // An uncapped type — unpaid leave — has no balance to spend.
    if (leaveType.daysPerCycle !== null) {
      const balance = await hrRepository.findBalance(
        data.employeeId,
        data.leaveTypeId,
        data.startsAt,
      );
      if (!balance) {
        throw new BusinessRuleError(
          `No ${leaveType.name} balance has been set for that period.`,
        );
      }

      const remaining =
        Number(balance.entitledDays) +
        Number(balance.broughtForwardDays) -
        Number(balance.takenDays);

      if (days > remaining) {
        throw new BusinessRuleError(
          `That is ${days} days and only ${remaining} remain.`,
        );
      }

      await hrRepository.addTakenDays(balance.id, days);
    }

    return hrRepository.createLeaveRequest({
      reference: await nextReference("LV"),
      employeeId: data.employeeId,
      leaveTypeId: data.leaveTypeId,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      days,
      reason: data.reason,
    });
  },

  /**
   * Approving or rejecting.
   *
   * Separation of duties, the same rule the tender and expense approvals use:
   * holding the approve permission is not enough if the leave is your own.
   */
  async decideLeave(input: unknown) {
    await requirePermission("hr.leave.approve");
    const data = decideLeaveSchema.parse(input);

    const request = await hrRepository.findLeaveRequest(data.requestId);
    if (!request) throw new NotFoundError("Leave request");
    if (request.status !== "SUBMITTED") {
      throw new BusinessRuleError("That request has already been decided.");
    }

    const mine = await this.myEmployeeId();
    if (mine && request.employeeId === mine) {
      throw new ForbiddenError(
        "You cannot approve your own leave. Ask another approver to review it.",
      );
    }

    const { userId } = requireRequestContext();

    // A rejection hands the days back; an approval has already spent them.
    if (data.decision === "REJECTED" && request.leaveType.daysPerCycle !== null) {
      const balance = await hrRepository.findBalance(
        request.employeeId,
        request.leaveTypeId,
        request.startsAt,
      );
      if (balance) await hrRepository.addTakenDays(balance.id, -Number(request.days));
    }

    return hrRepository.updateLeaveRequest(request.id, {
      status: data.decision,
      decidedById: userId,
      decidedAt: new Date(),
      decisionComment: data.comment,
    });
  },

  /** Withdrawing a request. Yours to withdraw, or an HR correction. */
  async cancelLeave(input: unknown) {
    const data = cancelLeaveSchema.parse(input);

    const request = await hrRepository.findLeaveRequest(data.requestId);
    if (!request) throw new NotFoundError("Leave request");
    if (request.status === "CANCELLED" || request.status === "REJECTED") {
      throw new BusinessRuleError("That request is not live.");
    }

    const mine = await this.myEmployeeId();
    if (request.employeeId !== mine) {
      await requirePermission("hr.leave.configure");
    } else {
      await requirePermission("hr.leave.request");
    }

    if (request.leaveType.daysPerCycle !== null) {
      const balance = await hrRepository.findBalance(
        request.employeeId,
        request.leaveTypeId,
        request.startsAt,
      );
      if (balance) await hrRepository.addTakenDays(balance.id, -Number(request.days));
    }

    return hrRepository.updateLeaveRequest(request.id, {
      status: "CANCELLED",
      decisionComment: data.reason,
    });
  },

  // -- Helpers --------------------------------------------------------------

  /** The employee record for whoever is signed in, when they have one. */
  async myEmployeeId(): Promise<string | null> {
    const { userId } = requireRequestContext();
    if (!userId) return null;
    const employee = await hrRepository.findEmployeeByUser(userId);
    return employee?.id ?? null;
  },

  /** Your own record is always visible; anyone else's needs the permission. */
  async assertMaySeeEmployee(employeeId: string) {
    const mine = await this.myEmployeeId();
    if (mine === employeeId) return;
    if (!(await hasPermission("hr.employee.view"))) {
      throw new ForbiddenError("You cannot view that employee.");
    }
  },
};

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
