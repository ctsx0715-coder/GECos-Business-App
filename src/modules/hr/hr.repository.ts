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

const SHIFT_SUMMARY = {
  select: {
    id: true,
    name: true,
    startsAtMinutes: true,
    endsAtMinutes: true,
    breakMinutes: true,
  },
} as const;

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
        workPattern: { include: { shift: SHIFT_SUMMARY } },
        shift: SHIFT_SUMMARY,
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

  listShifts(includeInactive = false) {
    return db.shift.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { startsAtMinutes: "asc" }],
      include: { _count: { select: { patterns: true } } },
    });
  },

  findShift(id: string) {
    return db.shift.findUnique({ where: { id } });
  },

  findShiftByCode(code: string) {
    return db.shift.findFirst({ where: { code } });
  },

  createShift(data: Omit<Prisma.ShiftUncheckedCreateInput, "organisationId">) {
    return db.shift.create({ data: { ...data, organisationId: tenant() } });
  },

  updateShift(id: string, data: Prisma.ShiftUncheckedUpdateInput) {
    return db.shift.update({ where: { id }, data });
  },

  listWorkPatterns(includeInactive = false) {
    return db.workPattern.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        shift: true,
        _count: { select: { employees: true } },
      },
    });
  },

  findWorkPattern(id: string) {
    return db.workPattern.findUnique({ where: { id } });
  },

  findWorkPatternByCode(code: string) {
    return db.workPattern.findFirst({ where: { code } });
  },

  findDefaultWorkPattern() {
    return db.workPattern.findFirst({
      where: { isDefault: true, isActive: true },
      include: { shift: { select: { id: true, name: true } } },
    });
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

  // -- Pattern assignments --------------------------------------------------

  /** Everybody a pattern can be given to, with where they stand today. */
  listAssignableEmployees() {
    return db.employee.findMany({
      where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
      orderBy: [{ department: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: {
        ...EMPLOYEE_SUMMARY,
        department: true,
        status: true,
        workPatternId: true,
        shiftId: true,
        workPattern: {
          select: {
            id: true,
            name: true,
            maxConsecutiveTurns: true,
            // The pattern's own shift is what somebody works when they have
            // no override of their own, so the board cannot report the hours
            // without it.
            shift: { select: { id: true, name: true } },
          },
        },
        shift: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Every turn these people have had, newest first.
   *
   * One query for the whole group rather than one per person: the fairness
   * watch asks this about the entire payroll on every page load, and eighty
   * round trips to answer one question is how a screen becomes slow enough
   * that somebody stops opening it.
   */
  turnsFor(employeeIds: string[]) {
    return db.patternAssignment.findMany({
      where: { employeeId: { in: employeeIds } },
      orderBy: [{ startsOn: "desc" }],
      include: {
        // The whole pattern, not just its name: the month view works out
        // which days somebody was due in *on each day of the month*, and a
        // month containing a rotation change needs the shape of both.
        workPattern: {
          select: {
            id: true,
            name: true,
            maxConsecutiveTurns: true,
            cycleDays: true,
            workingDayIndexes: true,
            anchorOn: true,
            hoursPerDay: true,
            shift: SHIFT_SUMMARY,
          },
        },
        shift: SHIFT_SUMMARY,
      },
    });
  },

  /** Turns running over a window, for the assignment screen's timeline. */
  turnsBetween(from: Date, to: Date) {
    return db.patternAssignment.findMany({
      where: {
        startsOn: { lte: to },
        OR: [{ endsOn: null }, { endsOn: { gte: from } }],
      },
      orderBy: [{ startsOn: "asc" }],
      include: {
        employee: { select: EMPLOYEE_SUMMARY },
        workPattern: { select: { id: true, name: true } },
        shift: { select: { id: true, name: true } },
      },
    });
  },

  findPatternAssignment(id: string) {
    return db.patternAssignment.findUnique({ where: { id } });
  },

  createPatternAssignment(
    data: Omit<Prisma.PatternAssignmentUncheckedCreateInput, "organisationId">,
  ) {
    return db.patternAssignment.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  updatePatternAssignment(
    id: string,
    data: Prisma.PatternAssignmentUncheckedUpdateInput,
  ) {
    return db.patternAssignment.update({ where: { id }, data });
  },

  deletePatternAssignment(id: string) {
    return db.patternAssignment.delete({ where: { id } });
  },

  /**
   * Closes whatever this person is on the day before a new turn opens.
   *
   * Only turns that started earlier: a turn already written for a later date
   * is somebody else's decision about the future, and clipping it silently
   * would undo a rotation that has already been planned.
   */
  closeTurnsBefore(employeeId: string, startsOn: Date, endsOn: Date) {
    return db.patternAssignment.updateMany({
      where: {
        employeeId,
        startsOn: { lt: startsOn },
        OR: [{ endsOn: null }, { endsOn: { gte: startsOn } }],
      },
      data: { endsOn },
    });
  },

  /**
   * Clears a turn that starts on the same day as the one being written.
   *
   * The same person, the same start date, assigned twice: that is a decision
   * corrected before it could mean anything, not two turns. Keeping both would
   * leave the fairness count reading a run of two where somebody changed their
   * mind, and the board unable to say which one is in force. Soft delete, like
   * everything else, so the corrected version is still in the record.
   */
  supersedeTurnsOn(employeeId: string, startsOn: Date) {
    return db.patternAssignment.deleteMany({ where: { employeeId, startsOn } });
  },

  /** Turns whose start date has arrived but which have not taken effect yet. */
  dueTurns(asOf: Date) {
    return db.patternAssignment.findMany({
      where: { appliedAt: null, startsOn: { lte: asOf } },
      orderBy: [{ startsOn: "asc" }],
      include: { employee: { select: EMPLOYEE_SUMMARY } },
    });
  },

  /** Where somebody stands right now, which every other screen reads. */
  setEmployeePattern(
    employeeId: string,
    data: { workPatternId: string; shiftId: string | null },
  ) {
    return db.employee.update({ where: { id: employeeId }, data });
  },

  /*
   * Sites to place people on.
   *
   * A narrow projection of projects — id, name, reference — rather than a call
   * into the projects service, which would demand projects.project.view. An HR
   * Manager rostering a crew needs the names of the sites; that is not the same
   * as access to budgets, tasks and margins, and granting the wider permission
   * to get the narrower fact is how permissions stop meaning anything.
   */
  listProjectsForRoster() {
    return db.project.findMany({
      where: { status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] } },
      select: { id: true, name: true, reference: true },
      orderBy: { name: "asc" },
    });
  },

  /** Assignments overlapping a window, with enough to render a roster row. */
  listAssignments(
    from: Date,
    to: Date,
    filter?: { projectId?: string; employeeId?: string },
  ) {
    return db.rosterAssignment.findMany({
      where: {
        startsAt: { lte: to },
        endsAt: { gte: from },
        ...(filter?.projectId ? { projectId: filter.projectId } : {}),
        ...(filter?.employeeId ? { employeeId: filter.employeeId } : {}),
      },
      orderBy: { startsAt: "asc" },
      include: {
        employee: { select: EMPLOYEE_SUMMARY },
        project: { select: { id: true, name: true, reference: true } },
      },
    });
  },

  findAssignment(id: string) {
    return db.rosterAssignment.findUnique({ where: { id } });
  },

  /** Assignments for one person that collide with a range. */
  overlappingAssignments(
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ) {
    return db.rosterAssignment.findMany({
      where: {
        employeeId,
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: { project: { select: { name: true } } },
    });
  },

  createAssignment(
    data: Omit<Prisma.RosterAssignmentUncheckedCreateInput, "organisationId">,
  ) {
    return db.rosterAssignment.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  deleteAssignment(id: string) {
    return db.rosterAssignment.delete({ where: { id } });
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

  // -- Time entries ---------------------------------------------------------

  /** The stretch somebody is on right now, if they are on one. */
  openTimeEntry(employeeId: string) {
    return db.timeEntry.findFirst({
      where: { employeeId, clockedOutAt: null },
      orderBy: { clockedInAt: "desc" },
      include: { shift: SHIFT_SUMMARY, project: { select: { id: true, name: true } } },
    });
  },

  /** Everybody currently on the clock, for the supervisor's view. */
  openTimeEntries() {
    return db.timeEntry.findMany({
      where: { clockedOutAt: null },
      orderBy: { clockedInAt: "asc" },
      include: {
        employee: { select: EMPLOYEE_SUMMARY },
        shift: SHIFT_SUMMARY,
        project: { select: { id: true, name: true } },
      },
    });
  },

  listTimeEntries(from: Date, to: Date, filter?: { employeeId?: string }) {
    return db.timeEntry.findMany({
      where: {
        workedOn: { gte: from, lte: to },
        ...(filter?.employeeId ? { employeeId: filter.employeeId } : {}),
      },
      orderBy: [{ workedOn: "asc" }, { clockedInAt: "asc" }],
      include: {
        employee: { select: EMPLOYEE_SUMMARY },
        shift: SHIFT_SUMMARY,
        project: { select: { id: true, name: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
    });
  },

  /** Everything that touches one day, for the overlap check. */
  timeEntriesOn(employeeId: string, workedOn: Date) {
    return db.timeEntry.findMany({
      where: { employeeId, workedOn },
      orderBy: { clockedInAt: "asc" },
    });
  },

  findTimeEntry(id: string) {
    return db.timeEntry.findUnique({ where: { id } });
  },

  createTimeEntry(
    data: Omit<Prisma.TimeEntryUncheckedCreateInput, "organisationId">,
  ) {
    return db.timeEntry.create({ data: { ...data, organisationId: tenant() } });
  },

  updateTimeEntry(id: string, data: Prisma.TimeEntryUncheckedUpdateInput) {
    return db.timeEntry.update({ where: { id }, data });
  },

  deleteTimeEntry(id: string) {
    return db.timeEntry.delete({ where: { id } });
  },

  // -- Staffing rules -------------------------------------------------------

  listStaffingRules(includeInactive = false) {
    return db.staffingRule.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ name: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        shift: { select: { id: true, name: true } },
      },
    });
  },

  findStaffingRule(id: string) {
    return db.staffingRule.findUnique({ where: { id } });
  },

  createStaffingRule(
    data: Omit<Prisma.StaffingRuleUncheckedCreateInput, "organisationId">,
  ) {
    return db.staffingRule.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  updateStaffingRule(id: string, data: Prisma.StaffingRuleUncheckedUpdateInput) {
    return db.staffingRule.update({ where: { id }, data });
  },

  deleteStaffingRule(id: string) {
    return db.staffingRule.delete({ where: { id } });
  },

  /** The roles one person holds, for deciding whose rung an approval is. */
  async roleIdsOf(userId: string | null) {
    if (!userId) return [];
    const links = await db.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    return links.map((link) => link.roleId);
  },
};
