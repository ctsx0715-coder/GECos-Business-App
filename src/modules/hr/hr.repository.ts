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
        workPattern: true,
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
        workPattern: true,
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

  findLeaveTypeByCode(code: string) {
    return db.leaveType.findFirst({ where: { code } });
  },

  updateLeaveType(id: string, data: Prisma.LeaveTypeUncheckedUpdateInput) {
    return db.leaveType.update({ where: { id }, data });
  },

  /** Types that credit themselves, for the accrual run. */
  listAccruingLeaveTypes() {
    return db.leaveType.findMany({
      where: { isActive: true, accrualMethod: { not: "MANUAL" } },
      orderBy: { sortOrder: "asc" },
    });
  },

  /** One balance per employee for a type and cycle, however many employees. */
  balancesForCycle(leaveTypeId: string, cycleStartsAt: Date) {
    return db.leaveBalance.findMany({ where: { leaveTypeId, cycleStartsAt } });
  },

  creditBalance(
    balanceId: string,
    days: number,
    accruedThroughAt: Date,
  ) {
    return db.leaveBalance.update({
      where: { id: balanceId },
      data: {
        entitledDays: { increment: days },
        accruedThroughAt,
      },
    });
  },

  /**
   * Set rather than increment, which is what makes the rollover idempotent:
   * the figure is recomputed from the closing cycle every time, so running it
   * twice lands on the same number instead of doubling it.
   */
  setBroughtForward(balanceId: string, days: number) {
    return db.leaveBalance.update({
      where: { id: balanceId },
      data: { broughtForwardDays: days },
    });
  },

  adjustEntitlement(balanceId: string, days: number, notes: string) {
    return db.leaveBalance.update({
      where: { id: balanceId },
      data: { entitledDays: { increment: days }, notes },
    });
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

  findBalanceForCycle(
    employeeId: string,
    leaveTypeId: string,
    cycleStartsAt: Date,
  ) {
    return db.leaveBalance.findFirst({
      where: { employeeId, leaveTypeId, cycleStartsAt },
      include: { leaveType: true },
    });
  },

  upsertBalance(
    key: { employeeId: string; leaveTypeId: string; cycleStartsAt: Date },
    data: {
      cycleEndsAt: Date;
      entitledDays: number;
      broughtForwardDays: number;
      notes?: string | null;
    },
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

  /*
   * Certifications are compliance items pointed at an employee (ADR-004).
   * Reading them through Prisma rather than the raw query in hr-metrics is
   * deliberate: that one answers "what is about to expire" for the dashboard
   * and drops anything without an expiry date. A trade test never expires and
   * still has to appear on the person's record.
   */
  listCertifications(employeeId: string) {
    return db.complianceItem.findMany({
      where: { entityType: "EMPLOYEE", entityId: employeeId },
      orderBy: [{ expiresAt: "asc" }, { requirementName: "asc" }],
    });
  },

  findCertification(id: string) {
    return db.complianceItem.findUnique({ where: { id } });
  },

  createCertification(
    data: Omit<
      Prisma.ComplianceItemUncheckedCreateInput,
      "organisationId" | "entityType"
    >,
  ) {
    return db.complianceItem.create({
      data: { ...data, entityType: "EMPLOYEE", organisationId: tenant() },
    });
  },

  updateCertification(id: string, data: Prisma.ComplianceItemUncheckedUpdateInput) {
    return db.complianceItem.update({ where: { id }, data });
  },

  /** Soft delete, like everything else — the extension rewrites it (ADR-007). */
  deleteCertification(id: string) {
    return db.complianceItem.delete({ where: { id } });
  },

  listWorkPatterns(includeInactive = false) {
    return db.workPattern.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { _count: { select: { employees: true } } },
    });
  },

  findWorkPattern(id: string) {
    return db.workPattern.findUnique({ where: { id } });
  },

  findWorkPatternByCode(code: string) {
    return db.workPattern.findFirst({ where: { code } });
  },

  findDefaultWorkPattern() {
    return db.workPattern.findFirst({ where: { isDefault: true, isActive: true } });
  },

  createWorkPattern(
    data: Omit<Prisma.WorkPatternUncheckedCreateInput, "organisationId">,
  ) {
    return db.workPattern.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  updateWorkPattern(id: string, data: Prisma.WorkPatternUncheckedUpdateInput) {
    return db.workPattern.update({ where: { id }, data });
  },

  /** Stand every other pattern down, so exactly one default survives. */
  clearDefaultWorkPattern(exceptId: string) {
    return db.workPattern.updateMany({
      where: { isDefault: true, id: { not: exceptId } },
      data: { isDefault: false },
    });
  },

  listHolidays(from: Date, to: Date) {
    return db.publicHoliday.findMany({
      where: { observedOn: { gte: from, lte: to } },
      orderBy: { observedOn: "asc" },
    });
  },

  findHoliday(id: string) {
    return db.publicHoliday.findUnique({ where: { id } });
  },

  findHolidayOn(observedOn: Date) {
    return db.publicHoliday.findFirst({ where: { observedOn } });
  },

  createHoliday(
    data: Omit<Prisma.PublicHolidayUncheckedCreateInput, "organisationId">,
  ) {
    return db.publicHoliday.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  deleteHoliday(id: string) {
    return db.publicHoliday.delete({ where: { id } });
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
