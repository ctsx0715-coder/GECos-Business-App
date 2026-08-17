/**
 * The three-way match: what was ordered, what arrived, what we were billed.
 *
 * This is the whole point of running purchase orders rather than letting a
 * foreman phone a supplier. Any one of the three documents on its own proves
 * nothing — an invoice is a supplier's claim, a delivery note is a driver's
 * claim, and an order is what we agreed to. Money leaks in the gaps between
 * them, and every one of those gaps has a name.
 *
 * No database in here, and no permission checks. Everything is arithmetic on
 * numbers the caller has already loaded, which is what makes the awkward cases
 * — the part delivery, the over-delivery, the credit note — testable without a
 * fixture (ADR-008).
 *
 * Quantities are plain numbers rather than Prisma's Decimal. They are stored
 * as Decimal(12,3) and converted at the repository boundary: three decimal
 * places is well inside what a double represents exactly, and comparisons here
 * go through `EPSILON` rather than `===` regardless.
 *
 * Money is integer cents throughout. Quantity × unit price is the one place a
 * fraction of a cent appears, and it is rounded per line rather than at the
 * end, because the per-line figure is what somebody checks against the paper.
 */

import { formatCentsExact } from "@/lib/format";

/** Below this, two quantities are the same quantity. Three decimals stored. */
const EPSILON = 0.0005;

/**
 * How far an invoice may be from the goods before anybody is asked to look.
 *
 * Both, not either: a percentage alone treats a R2 discrepancy on a R400 order
 * as worth a phone call, and a flat amount alone waves through R80 of drift on
 * an order for R2 million. The default is the smaller of a small percentage
 * and a small amount — deliberately tight, because the cost of a false alarm
 * here is a glance and the cost of a miss is paying it.
 */
export interface Tolerance {
  cents: number;
  fraction: number;
}

export const DEFAULT_TOLERANCE: Tolerance = { cents: 100, fraction: 0.005 };

/** Whether a difference is small enough to be rounding rather than a query. */
export function withinTolerance(
  difference: number,
  reference: number,
  tolerance: Tolerance = DEFAULT_TOLERANCE,
): boolean {
  const allowed = Math.max(tolerance.cents, Math.abs(reference) * tolerance.fraction);
  return Math.abs(difference) <= allowed;
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export interface OrderedLine {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
}

/** One delivery's contribution to a line. Several of these per line is normal. */
export interface ReceivedAgainstLine {
  purchaseOrderLineId: string;
  quantity: number;
  rejectedQuantity: number;
}

/**
 * Where a single ordered line has got to.
 *
 * `OVER` is separate from `COMPLETE` rather than being treated as done,
 * because over-delivery is the case that costs money quietly: the extra
 * arrives, the storeman signs for it, and the supplier invoices for it.
 */
export type LineDelivery = "AWAITING" | "PART" | "COMPLETE" | "OVER";

export interface LineMatch {
  line: OrderedLine;
  /** Accepted. What was sent back is not what we owe for. */
  receivedQuantity: number;
  rejectedQuantity: number;
  outstandingQuantity: number;
  delivery: LineDelivery;
  orderedCents: number;
  receivedCents: number;
}

/** The value of a line, rounded to the cent it will be checked against. */
export function lineValueCents(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

export function matchLine(
  line: OrderedLine,
  receipts: ReceivedAgainstLine[],
): LineMatch {
  const mine = receipts.filter((receipt) => receipt.purchaseOrderLineId === line.id);
  const receivedQuantity = mine.reduce((total, receipt) => total + receipt.quantity, 0);
  const rejectedQuantity = mine.reduce(
    (total, receipt) => total + receipt.rejectedQuantity,
    0,
  );

  const difference = receivedQuantity - line.quantity;
  const delivery: LineDelivery =
    receivedQuantity <= EPSILON
      ? "AWAITING"
      : difference > EPSILON
        ? "OVER"
        : difference >= -EPSILON
          ? "COMPLETE"
          : "PART";

  return {
    line,
    receivedQuantity,
    rejectedQuantity,
    // Never negative: an over-delivery leaves nothing outstanding, it leaves a
    // conversation, and a negative "still to come" reads as a credit owed.
    outstandingQuantity: Math.max(0, line.quantity - receivedQuantity),
    delivery,
    orderedCents: lineValueCents(line.quantity, line.unitPriceCents),
    receivedCents: lineValueCents(receivedQuantity, line.unitPriceCents),
  };
}

// ---------------------------------------------------------------------------
// The order
// ---------------------------------------------------------------------------

export interface InvoicedAmount {
  id: string;
  invoiceNumber: string;
  netAmountCents: number;
  disputed: boolean;
}

/** Whether everything ordered has arrived. */
export type OrderDelivery = "AWAITING" | "PART" | "COMPLETE" | "OVER";

/**
 * Whether what we have been billed agrees with what we have had.
 *
 * Compared against what was *received*, not what was ordered. Billing for the
 * full order when half of it is still on the supplier's yard is the single
 * most common overpayment in construction procurement, and matching against
 * the order rather than the delivery is what lets it through.
 */
export type OrderBilling = "NOT_INVOICED" | "PART" | "MATCHED" | "OVER";

export interface OrderMatch {
  lines: LineMatch[];
  orderedCents: number;
  receivedCents: number;
  invoicedCents: number;
  /** Billed beyond the goods. Positive is money at risk; never negative. */
  overBilledCents: number;
  delivery: OrderDelivery;
  billing: OrderBilling;
  /** True when the order can be closed with nobody out of pocket. */
  settled: boolean;
  disputedInvoices: string[];
}

export function matchOrder(
  lines: OrderedLine[],
  receipts: ReceivedAgainstLine[],
  invoices: InvoicedAmount[],
  tolerance: Tolerance = DEFAULT_TOLERANCE,
): OrderMatch {
  const matched = lines.map((line) => matchLine(line, receipts));

  const orderedCents = matched.reduce((total, line) => total + line.orderedCents, 0);
  const receivedCents = matched.reduce((total, line) => total + line.receivedCents, 0);

  // A disputed invoice is still a claim against us and still counts here. It
  // is flagged separately rather than quietly dropped, because an order whose
  // only invoice is disputed must not read as "nothing billed".
  const invoicedCents = invoices.reduce(
    (total, invoice) => total + invoice.netAmountCents,
    0,
  );

  // An order nobody has filled in has nothing outstanding on it. Both `every`
  // calls below are vacuously true for an empty list and the first one wins,
  // so without this an empty order reads as awaiting a delivery it never asked
  // for — and then cannot be closed.
  const delivery: OrderDelivery =
    matched.length === 0
      ? "COMPLETE"
      : matched.some((line) => line.delivery === "OVER")
        ? "OVER"
        : matched.every((line) => line.delivery === "AWAITING")
          ? "AWAITING"
          : matched.every((line) => line.delivery === "COMPLETE")
            ? "COMPLETE"
            : "PART";

  const difference = invoicedCents - receivedCents;
  const billing: OrderBilling =
    invoices.length === 0
      ? "NOT_INVOICED"
      : withinTolerance(difference, receivedCents, tolerance)
        ? "MATCHED"
        : difference > 0
          ? "OVER"
          : "PART";

  return {
    lines: matched,
    orderedCents,
    receivedCents,
    invoicedCents,
    overBilledCents: Math.max(0, difference),
    delivery,
    billing,
    settled: delivery === "COMPLETE" && billing === "MATCHED",
    disputedInvoices: invoices
      .filter((invoice) => invoice.disputed)
      .map((invoice) => invoice.invoiceNumber),
  };
}

/**
 * What is wrong with this order, in the words somebody would use.
 *
 * Ordered worst first, because the screens show the first one and a buyer who
 * reads "one line is still outstanding" while being over-billed by R40 000 has
 * been told the least useful true thing.
 */
export function concerns(match: OrderMatch): string[] {
  const found: string[] = [];

  if (match.billing === "OVER") {
    found.push(
      `Billed ${formatCentsExact(match.overBilledCents)} more than has been delivered`,
    );
  }

  const over = match.lines.filter((line) => line.delivery === "OVER");
  if (over.length > 0) {
    found.push(
      over.length === 1
        ? `More arrived than was ordered on ${over[0].line.description}`
        : `More arrived than was ordered on ${over.length} lines`,
    );
  }

  if (match.disputedInvoices.length > 0) {
    found.push(`Invoice ${match.disputedInvoices.join(", ")} is in dispute`);
  }

  const rejected = match.lines.filter((line) => line.rejectedQuantity > EPSILON);
  if (rejected.length > 0) {
    found.push(
      rejected.length === 1
        ? `Some of ${rejected[0].line.description} was sent back`
        : `Goods were sent back on ${rejected.length} lines`,
    );
  }

  const outstanding = match.lines.filter(
    (line) => line.delivery === "AWAITING" || line.delivery === "PART",
  );
  if (outstanding.length > 0) {
    found.push(
      outstanding.length === 1
        ? `${describeQuantity(outstanding[0].outstandingQuantity, outstanding[0].line.unit)} of ${outstanding[0].line.description} still to come`
        : `${outstanding.length} lines still to come`,
    );
  }

  return found;
}

/**
 * Units that never take an s.
 *
 * Two kinds, kept in one set because the rule about them is the same. Symbols
 * — kg, m, t — are alphabetic but are not words, and "40 kgs" is wrong in a
 * way a supplier would notice. And the uncountables: "each" is the default
 * unit, so it is the one a naive rule would get wrong most often.
 */
const NEVER_PLURAL = new Set([
  "kg", "g", "t", "mg",
  "m", "mm", "cm", "km",
  "l", "ml", "kl",
  "each", "lot", "set", "sum", "no",
]);

/**
 * A quantity with its unit, as somebody would write it on a purchase order.
 *
 * Two things happen here. Trailing zeroes come off the stored Decimal(12,3),
 * so it reads "12.5 m³" rather than "12.500 m³". And a unit that is an
 * ordinary English word is pluralised, because "14 day of compactor hire" is
 * how a machine writes and not how a buyer does.
 *
 * The unit is free text — a pattern says which days, a unit says how it is
 * billed, and plant hire is in days while readymix is in cubic metres — so
 * this cannot be a lookup table. It pluralises words and leaves everything
 * else exactly as it was typed, which is the safe direction to be wrong in.
 */
export function describeQuantity(quantity: number, unit: string): string {
  const rounded = Math.round(quantity * 1000) / 1000;

  const pluralise =
    rounded !== 1 &&
    /^[a-z]+$/i.test(unit) &&
    !NEVER_PLURAL.has(unit.toLowerCase());

  return `${rounded} ${pluralise ? `${unit}s` : unit}`;
}
