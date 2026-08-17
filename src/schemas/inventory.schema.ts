import { z } from "zod";

/**
 * What a form is allowed to send about the stock register.
 *
 * Quantities are fractional and validated to three places, matching the
 * column, for the same reason a purchase order line is: readymix is poured in
 * fractions of a cubic metre and rounding 12.5 to 13 turns a delivery into an
 * argument.
 *
 * Money barely appears here. A receipt's price comes off the order it was
 * delivered against rather than off a form, which is deliberate — the one
 * place somebody could type a stock value straight in is the place the
 * valuation could be quietly rewritten.
 */

/** Three decimal places, matching the column. More than that is a typo. */
const quantity = z
  .number()
  .max(9_999_999, "That is not a quantity anybody holds.")
  .refine((value) => Number.isInteger(Math.round(value * 1000)), {
    message: "Quantities go to three decimal places.",
  });

const positiveQuantity = quantity.refine((value) => value > 0, {
  message: "A quantity has to be more than nothing.",
});

/** A counted quantity may be zero — that is the whole point of counting. */
const countedQuantity = quantity.refine((value) => value >= 0, {
  message: "A count cannot be less than nothing.",
});

const EXPENSE_CATEGORIES = [
  "LABOUR",
  "MATERIALS",
  "PLANT",
  "SUBCONTRACTOR",
  "TRANSPORT",
  "OTHER",
] as const;

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

export const stockItemSchema = z.object({
  name: z.string().trim().min(2, "Say what the item is."),
  code: z.string().trim().max(50).optional(),
  description: z.string().trim().max(1000).optional(),
  unit: z.string().trim().min(1).max(20).default("each"),
  category: z.enum(EXPENSE_CATEGORIES).default("MATERIALS"),
  /// Nullable rather than optional-with-a-default. Nobody having set a level
  /// is a real answer, and it must not become zero — zero is a deliberate
  /// "only buy it when a job needs it", and the two produce opposite alerts.
  reorderLevel: quantity.nonnegative().nullish(),
  reorderQuantity: quantity.nonnegative().nullish(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateStockItemSchema = stockItemSchema.extend({
  id: z.uuid(),
});

export const stockLocationSchema = z.object({
  name: z.string().trim().min(2, "Give the store a name."),
  projectId: z.uuid().nullish(),
  address: z.string().trim().max(500).optional(),
  isDefault: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
});

export const updateStockLocationSchema = stockLocationSchema.extend({
  id: z.uuid(),
});

// ---------------------------------------------------------------------------
// Moving stock
// ---------------------------------------------------------------------------

/** Nothing may be dated into the future: stock cannot have moved yet. */
const movedAt = z.coerce
  .date()
  .refine((value) => value.getTime() <= Date.now(), {
    message: "That has not happened yet.",
  });

export const issueStockSchema = z.object({
  stockItemId: z.uuid("Choose an item."),
  fromLocationId: z.uuid("Say which store it came out of."),
  quantity: positiveQuantity,
  movedAt,
  /// What it was used on. Optional because a bag of cement drawn to patch the
  /// yard wall belongs to no job, and forcing a project onto every issue means
  /// somebody picks one at random.
  projectId: z.uuid().nullish(),
  issuedToEmployeeId: z.uuid().nullish(),
  note: z.string().trim().max(1000).optional(),
});

export const returnStockSchema = z.object({
  stockItemId: z.uuid("Choose an item."),
  toLocationId: z.uuid("Say which store it went back into."),
  quantity: positiveQuantity,
  movedAt,
  projectId: z.uuid().nullish(),
  note: z.string().trim().max(1000).optional(),
});

export const transferStockSchema = z
  .object({
    stockItemId: z.uuid("Choose an item."),
    fromLocationId: z.uuid("Say which store it came out of."),
    toLocationId: z.uuid("Say which store it went to."),
    quantity: positiveQuantity,
    movedAt,
    note: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.fromLocationId !== data.toLocationId, {
    message: "That is the same store.",
    path: ["toLocationId"],
  });

/**
 * Correcting the ledger, or writing stock off.
 *
 * The quantity is signed here and nowhere else, because a correction is the
 * one movement whose direction the person making it chooses: everything else
 * is a physical event that already went one way. A write-off can only be
 * negative, which the refinement below enforces rather than trusting the form.
 */
export const adjustStockSchema = z
  .object({
    stockItemId: z.uuid("Choose an item."),
    locationId: z.uuid("Say which store."),
    /// Positive puts stock in, negative takes it out.
    quantity: quantity.refine((value) => value !== 0, {
      message: "An adjustment of nothing is not an adjustment.",
    }),
    kind: z.enum(["ADJUSTMENT", "WRITE_OFF"]).default("ADJUSTMENT"),
    movedAt,
    /// Never optional. An adjustment with no reason is indistinguishable from
    /// somebody making the number say what they wanted it to say, and it is
    /// the only record anybody will have when they come back to it in a year.
    reason: z.string().trim().min(3, "Say why the number is being changed."),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.kind !== "WRITE_OFF" || data.quantity < 0, {
    message: "A write-off takes stock out. Use an adjustment to put it in.",
    path: ["quantity"],
  });

// ---------------------------------------------------------------------------
// Stocktakes
// ---------------------------------------------------------------------------

export const startCountSchema = z.object({
  stockLocationId: z.uuid("Say which store is being counted."),
  countedOn: movedAt,
  countedByEmployeeId: z.uuid().nullish(),
  note: z.string().trim().max(1000).optional(),
});

export const countLineSchema = z.object({
  stockItemId: z.uuid(),
  countedQuantity,
  note: z.string().trim().max(500).optional(),
});

export const recordCountLinesSchema = z.object({
  id: z.uuid(),
  lines: z.array(countLineSchema).min(1, "Count something."),
});

export const submitCountSchema = z.object({ id: z.uuid() });

export const acceptCountSchema = z.object({
  id: z.uuid(),
  /// Required once the variance is material — the service decides where that
  /// line sits, because it is the only layer that has seen the figures.
  reason: z.string().trim().max(500).optional(),
});

export const abandonCountSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(3, "Say why the count is being given up on."),
});
