import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import type {
  EmployeeStatus,
  LeaveRequestStatus,
  Prisma,
} from "@/generated/prisma/client";

/** Data access for HR. No rules and no permission checks (ADR-008). */

function tenant() {
  return requireRequestContext().organisationId;
}

const EMPLOYEE_SUMMARY = {
  id: true,
  firstName: true,
  lastName: true,
  employeeNumber: true,
  jobTitle: true,
} as const;

export const hrRepository = {
  listEmployees(status?: EmployeeStatus[]) {
    return db.employee.findMany({
      where: status?.length ? { status: { in: status } } : undefined,
      orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      include: {
        manager: { select: EMPLOYEE_SUMMARY },
        user: { select: { id: true, email: true } },
      },
    });
  },

  findEmployee(id: string) {
    return db.employee.findUnique({
      where: { id },
      include: {
        manager: { select: EMPLOYEE_SUMMARY },
        reports: { select: EMPLOYEE_SUMMARY },
        user: { select: { id: true, email: true } },
        leaveBalances: {
          include: { leaveType: true },
          orderBy: { cycleStartsAt: "desc" },
        },
        leaveRequests: {
          orderBy: { startsAt: "desc" },
          include: {
            leaveType: { select: { id: true, name: true, code: true } },
            decidedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  },

  /** The employee record belonging to a login, if there is one. */
  findEmployeeByUser(userId: string) {
    return db.employee.findFirst({ where: { userId } });
  },

  createEmployee(data: Omit<Prisma.EmployeeUncheckedCreateInput, "organisationId">) {
    return db.employee.create({ data: { ...data, organisationId: tenant() } });
  },

  updateEmployee(id: string, data: Prisma.EmployeeUncheckedUpdateInput) {
    return db.employee.update({ where: { id }, data });
  },

  countEmployees(status?: EmployeeStatus[]) {
    return db.employee.count({
      where: status?.length ? { status: { in: status } } : undefined,
    });
  },

  listLeaveTypes(includeInactive = false) {
    return db.leaveType.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  },

  findLeaveType(id: string) {
    return db.leaveType.findUnique({ where: { id } });
  },

  createLeaveType(data: Omit<Prisma.LeaveTypeUncheckedCreateInput, "organisationId">) {
    return db.leaveType.create({ data: { ...data, organisationId: tenant() } });
  },

  findBalance(employeeId: string, leaveTypeId: string, on: Date) {
    return db.leaveBalance.findFirst({
      where: {
        employeeId,
        leaveTypeId,
        cycleStartsAt: { lte: on },
        cycleEndsAt: { gte: on },
      },
      include: { leaveType: true },
    });
  },

  balancesFor(employeeId: string) {
    return db.leaveBalance.findMany({
      where: { employeeId },
      include: { leaveType: true },
      orderBy: { cycleStartsAt: "desc" },
    });
  },

  upsertBalance(
    key: { employeeId: string; leaveTypeId: string; cycleStartsAt: Date },
    data: { cycleEndsAt: Date; entitledDays: number; broughtForwardDays: number },
  ) {
    const organisationId = tenant();
    return db.leaveBalance.upsert({
      where: {
        organisationId_employeeId_leaveTypeId_cycleStartsAt: {
          organisationId,
          ...key,
        },
      },
      create: { ...key, ...data, organisationId },
      update: data,
    });
  },

  addTakenDays(balanceId: string, days: Prisma.Decimal | number) {
    return db.leaveBalance.update({
      where: { id: balanceId },
      data: { takenDays: { increment: days } },
    });
  },

  listLeaveRequests(filter?: {
    status?: LeaveRequestStatus[];
    employeeId?: string;
  }) {
    return db.leaveRequest.findMany({
      where: {
        ...(filter?.status?.length ? { status: { in: filter.status } } : {}),
        ...(filter?.employeeId ? { employeeId: filter.employeeId } : {}),
      },
      orderBy: [{ status: "asc" }, { startsAt: "desc" }],
      include: {
        employee: { select: EMPLOYEE_SUMMARY },
        leaveType: { select: { id: true, name: true, code: true, isPaid: true } },
        decidedBy: { select: { firstName: true, lastName: true } },
      },
    });
  },

  findLeaveRequest(id: string) {
    return db.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: true,
        leaveType: true,
      },
    });
  },

  /**
   * Requests that would collide with a date range.
   *
   * Cancelled and rejected requests are excluded — only leave that is live or
   * already granted can clash with new leave.
   */
  overlappingRequests(employeeId: string, startsAt: Date, endsAt: Date, excludeId?: string) {
    return db.leaveRequest.findMany({
      where: {
        employeeId,
        status: { in: ["SUBMITTED", "APPROVED"] },
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: { leaveType: { select: { name: true } } },
    });
  },

  createLeaveRequest(
    data: Omit<Prisma.LeaveRequestUncheckedCreateInput, "organisationId">,
  ) {
    return db.leaveRequest.create({ data: { ...data, organisationId: tenant() } });
  },

  updateLeaveRequest(id: string, data: Prisma.LeaveRequestUncheckedUpdateInput) {
    return db.leaveRequest.update({ where: { id }, data });
  },
};
