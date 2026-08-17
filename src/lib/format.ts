/**
 * Presentation helpers.
 *
 * Money is stored as integer cents (ADR: never floats) and rendered in the
 * organisation's currency. Large tender values are abbreviated because a
 * dashboard tile showing "R31 800 000,00" is harder to read at a glance than
 * "R31.8m".
 */

const ZAR = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

export function formatCents(cents: bigint | number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return ZAR.format(Number(cents) / 100);
}

const ZAR_EXACT = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * To the cent, for figures that are being checked against a piece of paper.
 *
 * The rounded form above is right for a dashboard tile and wrong for a
 * discrepancy: "billed R93 more" when the figure is R92,50 invites the reply
 * that the system is out by fifty cents.
 */
export function formatCentsExact(
  cents: bigint | number | null | undefined,
): string {
  if (cents === null || cents === undefined) return "—";
  return ZAR_EXACT.format(Number(cents) / 100);
}

/** Compact form for dashboard tiles: R31.8m, R450k. */
export function formatCentsCompact(
  cents: bigint | number | null | undefined,
): string {
  if (cents === null || cents === undefined) return "—";
  const rands = Number(cents) / 100;
  if (Math.abs(rands) >= 1_000_000) return `R${(rands / 1_000_000).toFixed(1)}m`;
  if (Math.abs(rands) >= 1_000) return `R${Math.round(rands / 1_000)}k`;
  return `R${rands.toFixed(0)}`;
}

const DATE = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Johannesburg",
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return DATE.format(new Date(value));
}

/** "in 4 days", "today", "6 days ago" — relative to now, in whole days. */
export function formatRelativeDays(value: Date | string | null | undefined): {
  label: string;
  days: number;
} {
  if (!value) return { label: "—", days: Number.POSITIVE_INFINITY };
  const target = new Date(value).getTime();
  const days = Math.ceil((target - Date.now()) / 86_400_000);

  if (days === 0) return { label: "today", days };
  if (days === 1) return { label: "tomorrow", days };
  if (days === -1) return { label: "yesterday", days };
  if (days > 0) return { label: `in ${days} days`, days };
  return { label: `${Math.abs(days)} days ago`, days };
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const TENDER_STATUS_LABELS: Record<string, string> = {
  IDENTIFIED: "Identified",
  IN_PROGRESS: "In progress",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  SUBMITTED: "Submitted",
  WON: "Won",
  LOST: "Lost",
  NO_BID: "No bid",
  WITHDRAWN: "Withdrawn",
};

export function tenderStatusLabel(status: string): string {
  return TENDER_STATUS_LABELS[status] ?? status;
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
 *
 * Lives here rather than in procurement because the store issues stock in the
 * same units the buyer ordered it in, and two copies of this rule would drift
 * until an order for 10 tonnes was issued as "10 tonne".
 */
export function describeQuantity(quantity: number, unit: string): string {
  const rounded = Math.round(quantity * 1000) / 1000;

  const pluralise =
    rounded !== 1 &&
    /^[a-z]+$/i.test(unit) &&
    !NEVER_PLURAL.has(unit.toLowerCase());

  return `${rounded} ${pluralise ? `${unit}s` : unit}`;
}
