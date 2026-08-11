import { z } from "zod";

/**
 * One schema per entity, shared by client-side validation and the server.
 *
 * Money arrives from forms as rands and is stored as integer cents, so the
 * conversion lives here rather than being repeated at every call site.
 */

const randsToCents = z
  .number()
  .nonnegative()
  .finite()
  .transform((rands) => BigInt(Math.round(rands * 100)));

export const createTenderSchema = z.object({
  title: z.string().trim().min(3, "Give the tender a recognisable title."),
  /** The client's own reference, as printed on their documents. */
  tenderNumber: z.string().trim().max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  customerId: z.uuid().optional(),
  ownerId: z.uuid().optional(),
  closingAt: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), "The closing date has passed."),
  estimatedValueRands: randsToCents.optional(),
  industry: z.string().trim().max(120).optional(),
});

export type CreateTenderInput = z.input<typeof createTenderSchema>;
export type CreateTenderData = z.output<typeof createTenderSchema>;

export const updateTenderSchema = createTenderSchema
  .partial()
  .omit({ closingAt: true })
  .extend({ closingAt: z.coerce.date().optional() });

export type UpdateTenderData = z.output<typeof updateTenderSchema>;

export const recordOutcomeSchema = z.object({
  status: z.enum(["WON", "LOST", "NO_BID", "WITHDRAWN"]),
  awardedValueRands: randsToCents.optional(),
  outcomeNotes: z.string().trim().max(5000).optional(),
});

export type RecordOutcomeData = z.output<typeof recordOutcomeSchema>;

export const approvalDecisionSchema = z.object({
  approvalId: z.uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(2000).optional(),
});

export type ApprovalDecisionData = z.output<typeof approvalDecisionSchema>;
