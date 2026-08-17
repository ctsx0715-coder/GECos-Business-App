import { z } from "zod";

/**
 * What a form is allowed to send about a supplier, an order or a delivery.
 *
 * Money arrives from a form as rands, because that is what somebody types off
 * a quotation, and is converted to integer cents at the service boundary. It
 * is never a float past this point.
 *
 * Quantities are the opposite case: they really are fractional, and rounding
 * 12.5 m³ of concrete to 13 turns an order into an argument. They are stored
 * as Decimal(12,3) and validated to three places here.
 */

/** Three decimal places, matching the column. More than that is a typo. */
const quantity = z
  .number()
  .positive("A quantity has to be more than nothing.")
  .max(9_999_999, "That is not a quantity anybody orders.")
  .refine((value) => Number.isInteger(Math.round(value * 1000)), {
    message: "Quantities go to three decimal places.",
  });

const rands = z
  .number()
  .nonnegative("A price cannot be negative.")
  .max(999_999_999, "That is more than the system will take.");

const EXPENSE_CATEGORIES = [
  "LABOUR",
  "MATERIALS",
  "PLANT",
  "SUBCONTRACTOR",
  "TRANSPORT",
  "OTHER",
] as const;

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Give the supplier's registered name."),
  tradingName: z.string().trim().max(200).optional(),
  registrationNumber: z.string().trim().max(50).optional(),
  vatNumber: z.string().trim().max(20).optional(),
  contactName: z.string().trim().max(200).optional(),
  email: z.email("That is not an email address.").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  /// 1 is the best. 8 is the worst that still counts. Null is "they have not
  /// given us a certificate", which is a different thing from level 8.
  bbbeeLevel: z.number().int().min(1).max(8).optional(),
  taxClearanceExpiresAt: z.coerce.date().optional(),
  supplies: z.array(z.string().trim().min(1)).max(20).default([]),
  notes: z.string().trim().max(2000).optional(),
});

export const updateSupplierSchema = supplierSchema.extend({
  id: z.uuid(),
});

export const supplierDecisionSchema = z.object({
  id: z.uuid(),
  status: z.enum(["PENDING", "APPROVED", "SUSPENDED"]),
  /// Suspending somebody we have been buying from is a decision that needs a
  /// reason attached, because the next person to try to raise an order will
  /// ask why they cannot.
  reason: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

export const orderLineSchema = z.object({
  description: z.string().trim().min(2, "Say what is being bought."),
  unit: z.string().trim().min(1).max(20).default("each"),
  quantity,
  unitPriceRands: rands,
  category: z.enum(EXPENSE_CATEGORIES).default("MATERIALS"),
});

export const createOrderSchema = z.object({
  supplierId: z.uuid("Choose a supplier."),
  projectId: z.uuid().optional(),
  deliverTo: z.string().trim().max(500).optional(),
  requiredBy: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(orderLineSchema).default([]),
});

export const updateOrderSchema = createOrderSchema.extend({
  id: z.uuid(),
});

export const addOrderLineSchema = orderLineSchema.extend({
  purchaseOrderId: z.uuid(),
});

export const removeOrderLineSchema = z.object({
  purchaseOrderId: z.uuid(),
  lineId: z.uuid(),
});

export const submitOrderSchema = z.object({ id: z.uuid() });

export const orderDecisionSchema = z.object({
  approvalId: z.uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(1000).optional(),
});

export const cancelOrderSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(3, "Say why it is being cancelled."),
});

export const closeOrderSchema = z.object({
  id: z.uuid(),
  /// Closing an order that is still short or still over-billed is sometimes
  /// the right call — the supplier has written the balance off, or nobody is
  /// going to chase R40. It needs saying out loud rather than being silent.
  reason: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------

export const receiptLineSchema = z.object({
  purchaseOrderLineId: z.uuid(),
  quantity: z.number().nonnegative().max(9_999_999),
  rejectedQuantity: z.number().nonnegative().max(9_999_999).default(0),
  rejectedReason: z.string().trim().max(500).optional(),
});

export const recordReceiptSchema = z
  .object({
    purchaseOrderId: z.uuid(),
    receivedAt: z.coerce.date(),
    deliveryNoteNumber: z.string().trim().max(60).optional(),
    receivedByEmployeeId: z.uuid().optional(),
    note: z.string().trim().max(1000).optional(),
    lines: z.array(receiptLineSchema).min(1, "Say what arrived."),
  })
  .refine((data) => data.receivedAt <= new Date(), {
    message: "That delivery is in the future.",
    path: ["receivedAt"],
  })
  .refine(
    (data) =>
      data.lines.some((line) => line.quantity > 0 || line.rejectedQuantity > 0),
    {
      message: "A delivery of nothing is not a delivery.",
      path: ["lines"],
    },
  )
  .refine(
    (data) =>
      data.lines.every(
        (line) => line.rejectedQuantity === 0 || Boolean(line.rejectedReason),
      ),
    {
      // Otherwise "12 rejected" appears on the order with nothing to tell the
      // supplier, and the reason is gone by the time anybody asks.
      message: "Say why the goods were sent back.",
      path: ["lines"],
    },
  );

// ---------------------------------------------------------------------------
// Supplier invoices
// ---------------------------------------------------------------------------

export const recordInvoiceSchema = z.object({
  purchaseOrderId: z.uuid(),
  invoiceNumber: z.string().trim().min(1, "Give the supplier's invoice number."),
  invoicedAt: z.coerce.date(),
  dueAt: z.coerce.date().optional(),
  /// Excluding VAT, so it can be compared against the order, which also is.
  netAmountRands: rands,
  vatRands: rands.default(0),
});

export const invoiceDecisionSchema = z
  .object({
    id: z.uuid(),
    decision: z.enum(["APPROVED", "DISPUTED", "PAID"]),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.decision !== "DISPUTED" || Boolean(data.reason), {
    message: "Say what is wrong with it.",
    path: ["reason"],
  });
