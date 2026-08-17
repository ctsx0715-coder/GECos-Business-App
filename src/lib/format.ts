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
