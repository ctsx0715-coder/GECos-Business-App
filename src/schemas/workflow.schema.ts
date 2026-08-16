import { z } from "zod";

/**
 * Approval chains: what needs approving, and by whom, in what order.
 *
 * The engine (ADR-006) has enforced these since the tender module shipped; the
 * chains themselves were only ever written by the seed. These schemas are what
 * let somebody build one without a deployment.
 */

/**
 * The record types a chain can be attached to.
 *
 * A subset of EntityType on purpose: the engine can trigger on anything, but
 * offering a chain on a contact or a document would be offering something no
 * service currently starts, and a chain that never runs is worse than no
 * chain — somebody will believe it is protecting them.
 */
export const APPROVABLE_ENTITIES = ["TENDER", "EXPENSE", "PROJECT"] as const;

export const createChainSchema = z.object({
  name: z.string().trim().min(3, "Name the chain."),
  entityType: z.enum(APPROVABLE_ENTITIES),
  /** e.g. "tender.submitted_for_approval". The event a service raises. */
  triggerEvent: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z_]+\.[a-z_]+$/, "Use the form entity.event, e.g. tender.submitted."),
});

export const updateChainSchema = z.object({
  chainId: z.uuid(),
  name: z.string().trim().min(3, "Name the chain.").optional(),
  isActive: z.boolean().optional(),
});

/**
 * One rung of the ladder.
 *
 * Three ways to say who approves, and they answer different questions. A role
 * means "whoever holds this job", which survives someone leaving. A manager
 * means "the requester's manager", which is the only one that produces a
 * genuine hierarchy — different for every requester. A named user is the
 * escape hatch for "the MD signs this personally", and the one that needs
 * revisiting when they go on leave.
 */
export const addStepSchema = z
  .object({
    chainId: z.uuid(),
    name: z.string().trim().min(2, "Name the step, e.g. Finance review."),
    approverType: z.enum(["ROLE", "MANAGER", "USER"]),
    approverRoleId: z.uuid().nullable().optional(),
    approverUserId: z.uuid().nullable().optional(),
    /** Hours before it is overdue. Null means no clock. */
    slaHours: z.number().int().min(1).max(720).nullable().optional(),
    /** A scalar on the triggering record, e.g. estimatedValueCents. */
    conditionField: z.string().trim().max(60).nullable().optional(),
    conditionOperator: z
      .enum(["EQ", "NEQ", "GT", "GTE", "LT", "LTE"])
      .nullable()
      .optional(),
    conditionValue: z.string().trim().max(60).nullable().optional(),
  })
  .refine(
    (data) => data.approverType !== "ROLE" || Boolean(data.approverRoleId),
    { message: "Choose the role that approves.", path: ["approverRoleId"] },
  )
  .refine(
    (data) => data.approverType !== "USER" || Boolean(data.approverUserId),
    { message: "Choose the person who approves.", path: ["approverUserId"] },
  )
  /*
   * A condition needs all three parts or none. Two of the three is a rule
   * nobody can evaluate, and the engine would silently treat it as "always
   * applies" — which is the opposite of what a half-written condition means.
   */
  .refine(
    (data) => {
      const parts = [
        data.conditionField,
        data.conditionOperator,
        data.conditionValue,
      ].filter(Boolean).length;
      return parts === 0 || parts === 3;
    },
    {
      message: "A condition needs a field, an operator and a value.",
      path: ["conditionValue"],
    },
  );

export const removeStepSchema = z.object({
  stepId: z.uuid(),
});

export const moveStepSchema = z.object({
  stepId: z.uuid(),
  direction: z.enum(["UP", "DOWN"]),
});
