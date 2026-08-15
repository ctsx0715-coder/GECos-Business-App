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
  });

export const exitEmployeeSchema = z.object({
  employeeId: z.uuid(),
  endedAt: z.coerce.date(),
  reason: z.string().trim().min(3, "Record why they are leaving."),
});

export const createLeaveTypeSchema = z.object({
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
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const setBalanceSchema = z.object({
  employeeId: z.uuid(),
  leaveTypeId: z.uuid(),
  cycleStartsAt: z.coerce.date(),
  cycleEndsAt: z.coerce.date(),
  entitledDays: z.number().nonnegative().max(365),
  broughtForwardDays: z.number().nonnegative().max(365).default(0),
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
