import type { OrderBilling, OrderDelivery, LineDelivery } from "./matching";

/**
 * The words on the screen.
 *
 * Kept out of the components because the enum values are shouted database
 * constants, and kept in one file because the order list, the order page and
 * the module's front page have to agree — a state reading "Part delivered" in
 * one place and "Partly received" in another looks like two different things.
 */

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
};

export const SUPPLIER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Not yet cleared",
  APPROVED: "Cleared",
  SUSPENDED: "Suspended",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  APPROVED: "Released for payment",
  DISPUTED: "In dispute",
  PAID: "Paid",
};

export const DELIVERY_LABELS: Record<OrderDelivery | LineDelivery, string> = {
  AWAITING: "Nothing delivered",
  PART: "Part delivered",
  COMPLETE: "Delivered",
  OVER: "Over-delivered",
};

export const BILLING_LABELS: Record<OrderBilling, string> = {
  NOT_INVOICED: "Not invoiced",
  PART: "Part invoiced",
  MATCHED: "Invoice matches",
  OVER: "Billed over",
};

export function orderStatusTone(status: string): Tone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "SUBMITTED":
      return "warning";
    case "REJECTED":
    case "CANCELLED":
      return "danger";
    case "CLOSED":
      return "info";
    default:
      return "neutral";
  }
}

export function supplierStatusTone(status: string): Tone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "SUSPENDED":
      return "danger";
    default:
      return "warning";
  }
}

export function invoiceStatusTone(status: string): Tone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "PAID":
      return "info";
    case "DISPUTED":
      return "danger";
    default:
      return "warning";
  }
}

/**
 * Delivery colours.
 *
 * `OVER` is a warning rather than a success even though more arrived than was
 * asked for, because somebody is about to be invoiced for the difference.
 */
export function deliveryTone(delivery: OrderDelivery | LineDelivery): Tone {
  switch (delivery) {
    case "COMPLETE":
      return "success";
    case "PART":
      return "info";
    case "OVER":
      return "warning";
    default:
      return "neutral";
  }
}

export function billingTone(billing: OrderBilling): Tone {
  switch (billing) {
    case "MATCHED":
      return "success";
    case "OVER":
      return "danger";
    case "PART":
      return "info";
    default:
      return "neutral";
  }
}

/** 1 is the best. Null is "no certificate", which is not the same as level 8. */
export function bbbeeLabel(level: number | null): string {
  if (level === null) return "No certificate";
  return `Level ${level}`;
}

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  LABOUR: "Labour",
  MATERIALS: "Materials",
  PLANT: "Plant",
  SUBCONTRACTOR: "Subcontractor",
  TRANSPORT: "Transport",
  OTHER: "Other",
};
