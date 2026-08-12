import { z } from "zod";

/** Money arrives as rands and is stored as integer cents. */
const randsToCents = z
  .number()
  .nonnegative()
  .finite()
  .transform((rands) => BigInt(Math.round(rands * 100)));

export const createProjectSchema = z.object({
  name: z.string().trim().min(3, "Name the project."),
  description: z.string().trim().max(5000).optional(),
  customerId: z.uuid(),
  managerId: z.uuid().optional(),
  tenderId: z.uuid().optional(),
  opportunityId: z.uuid().optional(),
  contractValueRands: randsToCents.optional(),
  budgetRands: randsToCents.optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

export type CreateProjectData = z.output<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .partial()
  .omit({ customerId: true })
  .extend({ percentComplete: z.number().int().min(0).max(100).optional() });

/** Starting a project from a tender that has actually been won. */
export const projectFromTenderSchema = z.object({
  tenderId: z.uuid(),
  name: z.string().trim().min(3).optional(),
  /// Defaults to the awarded value less a margin the manager sets.
  budgetRands: randsToCents.optional(),
  managerId: z.uuid().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

export const createTaskSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(3, "Give the task a title."),
  description: z.string().trim().max(5000).optional(),
  assigneeId: z.uuid().optional(),
  milestoneId: z.uuid().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueAt: z.coerce.date().optional(),
});

export const updateTaskStatusSchema = z
  .object({
    taskId: z.uuid(),
    status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]),
    /// Required when blocking: a stalled project should explain itself.
    blockedReason: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) =>
      data.status !== "BLOCKED" || (data.blockedReason?.length ?? 0) >= 3,
    { message: "Say what is blocking it.", path: ["blockedReason"] },
  );

export const createMilestoneSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(3),
  description: z.string().trim().max(2000).optional(),
  dueAt: z.coerce.date().optional(),
  isPaymentMilestone: z.boolean().default(false),
  valueRands: randsToCents.optional(),
});

export const addMemberSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  role: z
    .enum(["MANAGER", "ENGINEER", "SUPERVISOR", "FOREMAN", "MEMBER"])
    .default("MEMBER"),
  allocation: z.number().int().min(1).max(100).default(100),
});

export const createExpenseSchema = z.object({
  projectId: z.uuid(),
  description: z.string().trim().min(3, "Say what the cost was for."),
  category: z
    .enum(["LABOUR", "MATERIALS", "PLANT", "SUBCONTRACTOR", "TRANSPORT", "OTHER"])
    .default("OTHER"),
  amountRands: z.number().positive("An expense must have a value.").finite(),
  incurredAt: z.coerce.date().default(() => new Date()),
  supplierName: z.string().trim().max(200).optional(),
});

export type CreateExpenseData = z.output<typeof createExpenseSchema>;

export const decideExpenseSchema = z
  .object({
    expenseId: z.uuid(),
    decision: z.enum(["APPROVED", "REJECTED"]),
    reason: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) => data.decision !== "REJECTED" || (data.reason?.length ?? 0) >= 3,
    { message: "Give a reason for the rejection.", path: ["reason"] },
  );
