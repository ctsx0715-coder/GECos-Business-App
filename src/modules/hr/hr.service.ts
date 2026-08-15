import { nextReference } from "@/lib/database/reference-numbers";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { requirePermission, hasPermission } from "@/lib/permissions";
import {
  addHolidaySchema,
  adjustBalanceSchema,
  cancelLeaveSchema,
  certificationSchema,
  createEmployeeSchema,
  createLeaveTypeSchema,
  decideLeaveSchema,
  exitEmployeeSchema,
  generateHolidaysSchema,
  removeCertificationSchema,
  removeHolidaySchema,
  requestLeaveSchema,
  setBalanceSchema,
  updateEmployeeSchema,
  updateLeaveTypeSchema,
} from "@/schemas/hr.schema";
import type { EmployeeStatus, LeaveRequestStatus } from "@/generated/prisma/client";
import { hrRepository } from "./hr.repository";
import {
  accrualFor,
  carryOverFor,
  cycleFor,
  previousCycle,
} from "./leave-accrual";
import {
  isoDate,
  statutoryHolidays,
  workingDaysBetween as countWorkingDays,
} from "./public-holidays";

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
 * Working days, re-exported.
 *
 * The counting itself moved to public-holidays.ts when holidays arrived, since
 * the two cannot be separated: a day off is a day off whether it is a Saturday
 * or Freedom Day. This export stays because callers and tests refer to it, and
 * because where a leave day count comes from is a fact about the HR service.
 */
export { workingDaysBetween } from "./public-holidays";

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

  /**
   * One person's record.
   *
   * Your own needs no permission, which is the rule the leave and
   * certification methods already followed — and until now the one thing that
   * made them unreachable: both are read on the record screen, and the screen
   * itself demanded the permission that lets HR read everybody's. A site
   * supervisor could hold a balance they were not allowed to look at.
   */
  async getEmployee(id: string) {
    await this.assertMaySeeEmployee(id);
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

  // -- Certifications -------------------------------------------------------

  /**
   * The tickets one person holds.
   *
   * Your own are always visible, on the same rule as your own leave: a
   * boilermaker checking when their coded welding qualification runs out
   * should not need the permission that lets HR read everyone's medicals.
   */
  async certificationsFor(employeeId: string) {
    await this.assertMaySeeEmployee(employeeId);
    return hrRepository.listCertifications(employeeId);
  },

  async addCertification(input: unknown) {
    await requirePermission("hr.certification.manage");
    const data = certificationSchema.parse(input);

    const employee = await hrRepository.findEmployee(data.employeeId);
    if (!employee) throw new NotFoundError("Employee");

    if (data.issuedAt && data.expiresAt && data.expiresAt < data.issuedAt) {
      throw new BusinessRuleError("That expires before it was issued.");
    }

    return hrRepository.createCertification({
      entityId: data.employeeId,
      category: data.category,
      requirementName: data.requirementName,
      certificateNumber: data.certificateNumber,
      providerName: data.providerName,
      issuedAt: data.issuedAt,
      expiresAt: data.expiresAt,
      notes: data.notes,
    });
  },

  /**
   * Removing a certification.
   *
   * Soft, like every delete here. A ticket that was recorded and then removed
   * is part of why an audit found what it found, and the row survives to say
   * so (ADR-007).
   */
  async removeCertification(input: unknown) {
    await requirePermission("hr.certification.manage");
    const data = removeCertificationSchema.parse(input);

    const certification = await hrRepository.findCertification(
      data.certificationId,
    );
    if (!certification || certification.entityType !== "EMPLOYEE") {
      throw new NotFoundError("Certification");
    }

    return hrRepository.deleteCertification(data.certificationId);
  },

  // -- Leave configuration --------------------------------------------------

  async listLeaveTypes(includeInactive = false) {
    return hrRepository.listLeaveTypes(includeInactive);
  },

  async getLeaveType(id: string) {
    const leaveType = await hrRepository.findLeaveType(id);
    if (!leaveType) throw new NotFoundError("Leave type");
    return leaveType;
  },

  async createLeaveType(input: unknown) {
    await requirePermission("hr.leave.configure");
    const data = createLeaveTypeSchema.parse(input);

    const clash = await hrRepository.findLeaveTypeByCode(data.code);
    if (clash) {
      throw new BusinessRuleError(
        `${data.code} is already in use by ${clash.name}.`,
      );
    }

    return hrRepository.createLeaveType({
      code: data.code,
      name: data.name,
      description: data.description,
      daysPerCycle: data.daysPerCycle ?? null,
      isPaid: data.isPaid,
      carryOverMaxDays: data.carryOverMaxDays ?? null,
      documentRequiredAfterDays: data.documentRequiredAfterDays ?? null,
      allowsBackdating: data.allowsBackdating,
      accrualMethod: data.accrualMethod,
      accrualDaysPerPeriod: data.accrualDaysPerPeriod ?? null,
      sortOrder: data.sortOrder,
    });
  },

  /**
   * Changing a leave type.
   *
   * The code is not editable. It is what the seed, the backfill and any future
   * import match on, and renaming it silently orphans every one of them — the
   * name is the label, the code is the identity.
   */
  async updateLeaveType(input: unknown) {
    await requirePermission("hr.leave.configure");
    const { leaveTypeId, ...changes } = updateLeaveTypeSchema.parse(input);

    const leaveType = await hrRepository.findLeaveType(leaveTypeId);
    if (!leaveType) throw new NotFoundError("Leave type");

    const method = changes.accrualMethod ?? leaveType.accrualMethod;
    const perPeriod =
      changes.accrualDaysPerPeriod !== undefined
        ? changes.accrualDaysPerPeriod
        : leaveType.accrualDaysPerPeriod === null
          ? null
          : Number(leaveType.accrualDaysPerPeriod);
    const perCycle =
      changes.daysPerCycle !== undefined
        ? changes.daysPerCycle
        : leaveType.daysPerCycle === null
          ? null
          : Number(leaveType.daysPerCycle);

    // The same two impossible configurations the create schema refuses, caught
    // again here because an edit can arrive at them one field at a time.
    if (method === "MONTHLY_ACCRUAL" && !(perPeriod && perPeriod > 0)) {
      throw new BusinessRuleError(
        "Monthly accrual needs a number of days per month.",
      );
    }
    if (method === "ANNUAL_GRANT" && perCycle === null) {
      throw new BusinessRuleError("An annual grant needs an entitlement to grant.");
    }

    return hrRepository.updateLeaveType(leaveTypeId, changes);
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

  /**
   * Adding days to somebody's balance, or taking them back.
   *
   * Separate from `setBalance`, which writes an absolute figure for a cycle.
   * Adding three days for a public holiday worked is a different act from
   * declaring the year's entitlement, and conflating them is how an award ends
   * up wiping an accrual that happened the same afternoon.
   */
  async adjustBalance(input: unknown) {
    await requirePermission("hr.leave.configure");
    const data = adjustBalanceSchema.parse(input);

    const employee = await hrRepository.findEmployee(data.employeeId);
    if (!employee) throw new NotFoundError("Employee");

    const leaveType = await hrRepository.findLeaveType(data.leaveTypeId);
    if (!leaveType) throw new NotFoundError("Leave type");
    if (leaveType.daysPerCycle === null) {
      throw new BusinessRuleError(
        `${leaveType.name} is uncapped, so there is no balance to adjust.`,
      );
    }

    const cycle = cycleFor(data.cycleStartsAt ?? new Date());
    const existing = await hrRepository.findBalanceForCycle(
      data.employeeId,
      data.leaveTypeId,
      cycle.startsAt,
    );

    if (!existing) {
      if (data.days < 0) {
        throw new BusinessRuleError(
          "There is no balance for that cycle yet, so there is nothing to take away.",
        );
      }
      return hrRepository.upsertBalance(
        {
          employeeId: data.employeeId,
          leaveTypeId: data.leaveTypeId,
          cycleStartsAt: cycle.startsAt,
        },
        {
          cycleEndsAt: cycle.endsAt,
          entitledDays: data.days,
          broughtForwardDays: 0,
          notes: data.reason,
        },
      );
    }

    // Removing days that have already been taken would leave the ledger
    // claiming somebody was away on days they were never granted.
    const available =
      Number(existing.entitledDays) +
      Number(existing.broughtForwardDays) -
      Number(existing.takenDays);
    if (data.days < 0 && Math.abs(data.days) > available) {
      throw new BusinessRuleError(
        `Only ${available} unused days remain, so ${Math.abs(data.days)} cannot be removed.`,
      );
    }

    return hrRepository.adjustEntitlement(existing.id, data.days, data.reason);
  },

  /**
   * Credit every balance with what it has earned since the last run.
   *
   * Runs from a schedule and from a button, and does the same thing either
   * way. Idempotent by construction: each balance carries the date it was
   * credited to, and the engine only ever grants the periods between that and
   * today (see leave-accrual.ts). Running it twice in a day is a no-op, and a
   * run that was missed for three months catches up all three.
   */
  async runAccrual(options?: { asOf?: Date }) {
    await requirePermission("hr.leave.configure");
    return this.accrueWithoutPermissionCheck(options);
  },

  /**
   * The same run, for the scheduled job.
   *
   * The scheduler acts as the system rather than as a person, and a system
   * context holds no permissions at all — so the check above would refuse the
   * one caller that has to work unattended. Everything else goes through
   * `runAccrual`.
   */
  async accrueWithoutPermissionCheck(options?: { asOf?: Date }) {
    const asOf = options?.asOf ?? new Date();
    const cycle = cycleFor(asOf);

    const types = await hrRepository.listAccruingLeaveTypes();
    const employees = await hrRepository.listEmployees([
      "ACTIVE",
      "ON_LEAVE",
      "SUSPENDED",
    ]);

    const summary = {
      asOf,
      balancesCreated: 0,
      balancesCredited: 0,
      daysCredited: 0,
      balancesCarried: 0,
      daysCarriedOver: 0,
    };

    /*
     * Carry over first, then accrue.
     *
     * Both open the new cycle's balance, and the order decides what it looks
     * like when it is opened: days brought forward, then this cycle's own
     * entitlement credited on top. The other way round works too, but leaves a
     * moment where a balance exists claiming nothing was carried, which is
     * exactly the state somebody would screenshot on 1 January.
     */
    const carried = await this.carryOverInto(cycle, employees);
    summary.balancesCarried = carried.balances;
    summary.daysCarriedOver = carried.days;

    for (const leaveType of types) {
      const existing = await hrRepository.balancesForCycle(
        leaveType.id,
        cycle.startsAt,
      );
      const byEmployee = new Map(existing.map((row) => [row.employeeId, row]));

      for (const employee of employees) {
        // Nothing accrues before somebody starts, and a cycle that ends before
        // their first day never earns them anything.
        if (employee.startedAt > cycle.endsAt) continue;

        let balance = byEmployee.get(employee.id);
        if (!balance) {
          balance = await hrRepository.upsertBalance(
            {
              employeeId: employee.id,
              leaveTypeId: leaveType.id,
              cycleStartsAt: cycle.startsAt,
            },
            {
              cycleEndsAt: cycle.endsAt,
              entitledDays: 0,
              broughtForwardDays: 0,
            },
          );
          summary.balancesCreated += 1;
        }

        const outcome = accrualFor({
          method: leaveType.accrualMethod,
          daysPerPeriod:
            leaveType.accrualDaysPerPeriod === null
              ? null
              : Number(leaveType.accrualDaysPerPeriod),
          daysPerCycle:
            leaveType.daysPerCycle === null ? null : Number(leaveType.daysPerCycle),
          cycle,
          startedAt: employee.startedAt,
          endedAt: employee.endedAt,
          entitledDays: Number(balance.entitledDays),
          accruedThroughAt: balance.accruedThroughAt,
          asOf,
        });

        if (outcome.creditDays <= 0 || !outcome.accruedThroughAt) continue;

        await hrRepository.creditBalance(
          balance.id,
          outcome.creditDays,
          outcome.accruedThroughAt,
        );
        summary.balancesCredited += 1;
        summary.daysCredited += outcome.creditDays;
      }
    }

    summary.daysCredited = Math.round(summary.daysCredited * 100) / 100;
    return summary;
  },

  /**
   * Bring unused days across the cycle boundary.
   *
   * Without this, `carryOverMaxDays` is a column nobody reads and every unused
   * day disappears at midnight on 31 December — which is a policy some
   * employers do have, but not one anybody chose here, and not one that should
   * arrive by omission.
   *
   * It runs on every accrual run rather than only in January, because a run
   * that GitHub skipped on New Year's Day must not cost anybody their leave,
   * and because recomputing from the closing cycle is safe to repeat: the
   * figure is derived, not accumulated. It also means an adjustment made to
   * last year in February corrects this year's opening balance at the next
   * run rather than needing a second act of memory.
   */
  async carryOverInto(
    cycle: { startsAt: Date; endsAt: Date },
    employees: Array<{ id: string; startedAt: Date }>,
  ) {
    const closing = previousCycle(cycle);
    const types = await hrRepository.listLeaveTypes();
    const result = { balances: 0, days: 0 };

    for (const leaveType of types) {
      if (leaveType.carryOverMaxDays === null) continue;
      const cap = Number(leaveType.carryOverMaxDays);
      if (cap <= 0) continue;

      const previous = await hrRepository.balancesForCycle(
        leaveType.id,
        closing.startsAt,
      );
      if (previous.length === 0) continue;

      const current = new Map(
        (await hrRepository.balancesForCycle(leaveType.id, cycle.startsAt)).map(
          (row) => [row.employeeId, row],
        ),
      );
      const stillHere = new Set(employees.map((employee) => employee.id));

      for (const closingBalance of previous) {
        // Somebody who has left keeps their history and carries nothing into a
        // year they will not work.
        if (!stillHere.has(closingBalance.employeeId)) continue;

        const days = carryOverFor({
          carryOverMaxDays: cap,
          previous: {
            entitledDays: Number(closingBalance.entitledDays),
            broughtForwardDays: Number(closingBalance.broughtForwardDays),
            takenDays: Number(closingBalance.takenDays),
          },
        });

        const existing = current.get(closingBalance.employeeId);

        if (!existing) {
          if (days === 0) continue;
          await hrRepository.upsertBalance(
            {
              employeeId: closingBalance.employeeId,
              leaveTypeId: leaveType.id,
              cycleStartsAt: cycle.startsAt,
            },
            {
              cycleEndsAt: cycle.endsAt,
              entitledDays: 0,
              broughtForwardDays: days,
            },
          );
        } else {
          if (Number(existing.broughtForwardDays) === days) continue;
          await hrRepository.setBroughtForward(existing.id, days);
        }

        result.balances += 1;
        result.days += days;
      }
    }

    result.days = Math.round(result.days * 100) / 100;
    return result;
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

  // -- Public holidays ------------------------------------------------------

  /**
   * The days off in a range.
   *
   * Readable by anyone: which days the company is closed is not confidential,
   * and the leave form needs it to tell somebody their week costs four days
   * rather than five before they submit it.
   */
  async listHolidays(from: Date, to: Date) {
    return hrRepository.listHolidays(from, to);
  },

  /** The same list as a set of YYYY-MM-DD, which is what the counter wants. */
  async holidayDatesBetween(from: Date, to: Date): Promise<Set<string>> {
    const holidays = await hrRepository.listHolidays(from, to);
    return new Set(holidays.map((holiday) => isoDate(holiday.observedOn)));
  },

  /**
   * Write a year's statutory holidays.
   *
   * Idempotent by date: a day already recorded is left exactly as it is, so a
   * shutdown day somebody added by hand is never overwritten by the generator
   * and running it twice adds nothing the second time.
   */
  async generateStatutoryHolidays(input: unknown) {
    await requirePermission("hr.leave.configure");
    const { year } = generateHolidaysSchema.parse(input);

    let added = 0;
    for (const holiday of statutoryHolidays(year)) {
      const existing = await hrRepository.findHolidayOn(holiday.observedOn);
      if (existing) continue;

      await hrRepository.createHoliday({
        observedOn: holiday.observedOn,
        name: holiday.name,
        isStatutory: true,
      });
      added += 1;
    }
    return { year, added };
  },

  /** A shutdown day, an election day, anything the calculation cannot know. */
  async addHoliday(input: unknown) {
    await requirePermission("hr.leave.configure");
    const data = addHolidaySchema.parse(input);

    const clash = await hrRepository.findHolidayOn(data.observedOn);
    if (clash) {
      throw new BusinessRuleError(
        `${isoDate(data.observedOn)} is already recorded as ${clash.name}.`,
      );
    }

    return hrRepository.createHoliday({
      observedOn: data.observedOn,
      name: data.name,
      isStatutory: data.isStatutory,
      notes: data.notes,
    });
  },

  async removeHoliday(input: unknown) {
    await requirePermission("hr.leave.configure");
    const data = removeHolidaySchema.parse(input);

    const holiday = await hrRepository.findHoliday(data.holidayId);
    if (!holiday) throw new NotFoundError("Public holiday");

    return hrRepository.deleteHoliday(data.holidayId);
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

    /*
     * The holidays inside the range, not the whole year: a request is counted
     * against the days the company is actually closed, and asking for exactly
     * that range keeps the count honest when a shutdown is added later.
     */
    const holidays = await this.holidayDatesBetween(data.startsAt, data.endsAt);
    const days = countWorkingDays(data.startsAt, data.endsAt, holidays);
    if (days === 0) {
      throw new BusinessRuleError(
        "That range contains no working days. Weekends and public holidays do not need to be booked.",
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
