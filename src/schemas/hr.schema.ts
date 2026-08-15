import { z } from "zod";

/**
 * HR input validation.
 *
 * The same schemas the services parse are what the forms render errors from,
 * so a rule is stated once and enforced whether the request came from a screen
 * or from curl.
 */

export const createEmployeeSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.email("That is not a valid email address.").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  /**
   * Not validated as a South African ID number on purpose. Nopedi employs
   * foreign nationals on passports and asylum permits, and a checksum rule
   * that rejects those makes the field unusable for exactly the people whose
   * paperwork most needs tracking.
   */
  nationalId: z.string().trim().max(40).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  managerId: z.uuid().optional(),
  /** Links the employee to a login, where they have one. */
  userId: z.uuid().optional(),
  /** Which days they work. Omitted means the tenant's default pattern. */
  workPatternId: z.uuid().optional(),
  employmentType: z
    .enum(["PERMANENT", "FIXED_TERM", "TEMPORARY", "CONTRACTOR", "APPRENTICE"])
    .default("PERMANENT"),
  startedAt: z.coerce.date(),
});

export type CreateEmployeeData = z.output<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema
  .partial()
  .omit({ startedAt: true })
  .extend({
    startedAt: z.coerce.date().optional(),
    status: z.enum(["ACTIVE", "ON_LEAVE", "SUSPENDED", "EXITED"]).optional(),
    /** Null puts them back on the tenant's default pattern. */
    workPatternId: z.uuid().nullable().optional(),
  });

export const exitEmployeeSchema = z.object({
  employeeId: z.uuid(),
  endedAt: z.coerce.date(),
  reason: z.string().trim().min(3, "Record why they are leaving."),
});

export const createLeaveTypeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .regex(/^[A-Z0-9_]+$/, "Use capitals, digits and underscores."),
    name: z.string().trim().min(2, "Name the leave type."),
    description: z.string().trim().max(1000).optional(),
    /** Null means uncapped, which is how unpaid leave is expressed. */
    daysPerCycle: z.number().nonnegative().max(365).nullable().optional(),
    isPaid: z.boolean().default(true),
    carryOverMaxDays: z.number().nonnegative().max(365).nullable().optional(),
    documentRequiredAfterDays: z.number().int().nonnegative().max(365).nullable().optional(),
    allowsBackdating: z.boolean().default(false),
    accrualMethod: z.enum(["MANUAL", "ANNUAL_GRANT", "MONTHLY_ACCRUAL"]).default("MANUAL"),
    accrualDaysPerPeriod: z.number().nonnegative().max(31).nullable().optional(),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  /*
   * Two combinations would configure a type that can never credit anything,
   * and both look fine until an administrator wonders why nobody's balance
   * moved after a month. Rejecting them at the door is cheaper than the
   * support conversation.
   */
  .refine(
    (data) =>
      data.accrualMethod !== "MONTHLY_ACCRUAL" ||
      (data.accrualDaysPerPeriod ?? 0) > 0,
    {
      message: "Monthly accrual needs a number of days per month.",
      path: ["accrualDaysPerPeriod"],
    },
  )
  .refine(
    (data) =>
      data.accrualMethod !== "ANNUAL_GRANT" ||
      (data.daysPerCycle ?? null) !== null,
    {
      message: "An annual grant needs an entitlement to grant.",
      path: ["daysPerCycle"],
    },
  );

export const updateLeaveTypeSchema = z.object({
  leaveTypeId: z.uuid(),
  name: z.string().trim().min(2, "Name the leave type.").optional(),
  description: z.string().trim().max(1000).optional(),
  daysPerCycle: z.number().nonnegative().max(365).nullable().optional(),
  isPaid: z.boolean().optional(),
  carryOverMaxDays: z.number().nonnegative().max(365).nullable().optional(),
  documentRequiredAfterDays: z.number().int().nonnegative().max(365).nullable().optional(),
  allowsBackdating: z.boolean().optional(),
  accrualMethod: z.enum(["MANUAL", "ANNUAL_GRANT", "MONTHLY_ACCRUAL"]).optional(),
  accrualDaysPerPeriod: z.number().nonnegative().max(31).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const setBalanceSchema = z.object({
  employeeId: z.uuid(),
  leaveTypeId: z.uuid(),
  cycleStartsAt: z.coerce.date(),
  cycleEndsAt: z.coerce.date(),
  entitledDays: z.number().nonnegative().max(365),
  broughtForwardDays: z.number().nonnegative().max(365).default(0),
});

/**
 * Adding or removing days from a balance.
 *
 * Signed, because the correction after a mistake is the same action as the
 * award that caused it, and an "adjust" that only ever adds leaves the person
 * fixing it reaching for the database.
 */
export const adjustBalanceSchema = z.object({
  employeeId: z.uuid(),
  leaveTypeId: z.uuid(),
  days: z
    .number()
    .refine((value) => value !== 0, "Enter a number of days to add or remove.")
    .refine((value) => Math.abs(value) <= 365, "That is more than a year of leave."),
  reason: z.string().trim().min(3, "Say why, so the balance can be explained later."),
  /** Defaults to the cycle containing today. */
  cycleStartsAt: z.coerce.date().optional(),
});

/**
 * A ticket, medical or licence held by one person.
 *
 * Certifications are compliance items (ADR-004) rather than an HR-only table,
 * so the expiry sweep that watches company accreditations watches these too
 * without knowing what an employee is.
 */
export const certificationSchema = z.object({
  employeeId: z.uuid(),
  requirementName: z.string().trim().min(2, "Name the certification."),
  category: z.enum(["TRAINING", "MEDICAL", "HSE", "LICENCE", "ACCREDITATION"]),
  certificateNumber: z.string().trim().max(120).optional(),
  providerName: z.string().trim().max(120).optional(),
  issuedAt: z.coerce.date().optional(),
  /**
   * Optional because a trade test does not expire, and forcing a date would
   * put a fictional one in the column the expiry sweep reads.
   */
  expiresAt: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const removeCertificationSchema = z.object({
  certificationId: z.uuid(),
});

/**
 * A shift: a named stretch of the day.
 *
 * Times are minutes from midnight, so a night shift that ends before it starts
 * is not a contradiction — it is a shift that crosses midnight, which the form
 * says out loud rather than rejecting.
 */
const shiftFields = {
  name: z.string().trim().min(2, "Name the shift."),
  description: z.string().trim().max(1000).optional(),
  startsAtMinutes: z.number().int().min(0).max(1439),
  endsAtMinutes: z.number().int().min(0).max(1439),
  breakMinutes: z.number().int().min(0).max(480).default(0),
  sortOrder: z.number().int().min(0).max(999).default(0),
};

export const createShiftSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .regex(/^[A-Z0-9_]+$/, "Use capitals, digits and underscores."),
    ...shiftFields,
  })
  .refine((data) => data.startsAtMinutes !== data.endsAtMinutes, {
    message: "A shift that ends when it starts is zero hours long.",
    path: ["endsAtMinutes"],
  });

export const updateShiftSchema = z
  .object({
    shiftId: z.uuid(),
    ...shiftFields,
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.startsAtMinutes !== data.endsAtMinutes, {
    message: "A shift that ends when it starts is zero hours long.",
    path: ["endsAtMinutes"],
  });

/**
 * A working pattern.
 *
 * The indexes are validated against the cycle length rather than against a
 * week, because a fortnightly rotation is the case this shape exists for.
 */
const workPatternFields = {
  name: z.string().trim().min(2, "Name the pattern."),
  description: z.string().trim().max(1000).optional(),
  cycleDays: z
    .number()
    .int()
    .min(1)
    .max(56, "A cycle longer than eight weeks is almost certainly a mistake."),
  workingDayIndexes: z
    .array(z.number().int().min(0).max(55))
    .min(1, "Somebody has to work at least one day."),
  hoursPerDay: z.number().positive().max(24).default(8),
  /** Null means the hours are not specified — an office pattern, typically. */
  shiftId: z.uuid().nullable().optional(),
  isDefault: z.boolean().default(false),
};

export const createWorkPatternSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .regex(/^[A-Z0-9_]+$/, "Use capitals, digits and underscores."),
    ...workPatternFields,
  })
  .refine(
    (data) => data.workingDayIndexes.every((index) => index < data.cycleDays),
    {
      message: "A working day falls outside the cycle.",
      path: ["workingDayIndexes"],
    },
  );

export const updateWorkPatternSchema = z
  .object({
    workPatternId: z.uuid(),
    ...workPatternFields,
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => data.workingDayIndexes.every((index) => index < data.cycleDays),
    {
      message: "A working day falls outside the cycle.",
      path: ["workingDayIndexes"],
    },
  );

export const addHolidaySchema = z.object({
  observedOn: z.coerce.date(),
  name: z.string().trim().min(2, "Name the day."),
  /** False for a shutdown or anything else the company chose itself. */
  isStatutory: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
});

export const generateHolidaysSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

export const removeHolidaySchema = z.object({
  holidayId: z.uuid(),
});

export const requestLeaveSchema = z
  .object({
    employeeId: z.uuid(),
    leaveTypeId: z.uuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().trim().max(2000).optional(),
  })
  .refine((data) => data.endsAt >= data.startsAt, {
    message: "The last day is before the first day.",
    path: ["endsAt"],
  });

export type RequestLeaveData = z.output<typeof requestLeaveSchema>;

export const decideLeaveSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(2000).optional(),
});

export const cancelLeaveSchema = z.object({
  requestId: z.uuid(),
  reason: z.string().trim().max(2000).optional(),
});

/**
 * Placing somebody on a site for a stretch of days.
 *
 * A range rather than a day, because a fortnight on one site is one decision.
 * Which days inside it they actually work is read from their pattern, not
 * asked for here.
 */
export const assignToRosterSchema = z
  .object({
    employeeId: z.uuid(),
    /** Null is a placement with no project — a yard day, or training. */
    projectId: z.uuid().nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.endsAt >= data.startsAt, {
    message: "The last day is before the first day.",
    path: ["endsAt"],
  });

export const removeAssignmentSchema = z.object({
  assignmentId: z.uuid(),
});
