import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { Prisma } from "@/generated/prisma/client";

/**
 * The metrics layer (ADR-005).
 *
 * Prisma's query API is good at record access and bad at analytical
 * aggregation, so these are named, individually testable SQL queries returning
 * typed results. Dashboard widgets consume metrics; widgets never query Prisma
 * directly.
 *
 * Raw SQL bypasses the tenancy extension, so every query here takes
 * organisationId from the request context and filters on it explicitly. That
 * is the trade for using SQL, and it is why these live in one reviewed file
 * rather than being scattered through page components.
 */

function tenant(): string {
  return requireRequestContext().organisationId;
}

export interface TenderPipelineSummary {
  openCount: number;
  openValueCents: bigint;
  awaitingApproval: number;
  closingWithin7Days: number;
  submittedCount: number;
}

export async function tenderPipelineSummary(): Promise<TenderPipelineSummary> {
  const [row] = await db.$queryRaw<
    Array<{
      open_count: bigint;
      open_value_cents: bigint | null;
      awaiting_approval: bigint;
      closing_within_7_days: bigint;
      submitted_count: bigint;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (
        WHERE status IN ('IDENTIFIED','IN_PROGRESS','PENDING_APPROVAL','APPROVED')
      ) AS open_count,
      COALESCE(SUM("estimatedValueCents") FILTER (
        WHERE status IN ('IDENTIFIED','IN_PROGRESS','PENDING_APPROVAL','APPROVED')
      ), 0)::bigint AS open_value_cents,
      COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL') AS awaiting_approval,
      COUNT(*) FILTER (
        WHERE status NOT IN ('WON','LOST','NO_BID','WITHDRAWN','SUBMITTED')
          AND "closingAt" BETWEEN NOW() AND NOW() + INTERVAL '7 days'
      ) AS closing_within_7_days,
      COUNT(*) FILTER (WHERE status = 'SUBMITTED') AS submitted_count
    FROM tenders
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
  `);

  return {
    openCount: Number(row?.open_count ?? 0),
    openValueCents: row?.open_value_cents ?? 0n,
    awaitingApproval: Number(row?.awaiting_approval ?? 0),
    closingWithin7Days: Number(row?.closing_within_7_days ?? 0),
    submittedCount: Number(row?.submitted_count ?? 0),
  };
}

export interface WinRate {
  won: number;
  lost: number;
  /** Percentage of decided bids that were won, or null when none are decided. */
  ratePercent: number | null;
  wonValueCents: bigint;
}

export async function tenderWinRate(): Promise<WinRate> {
  const [row] = await db.$queryRaw<
    Array<{ won: bigint; lost: bigint; won_value_cents: bigint | null }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'WON')  AS won,
      COUNT(*) FILTER (WHERE status = 'LOST') AS lost,
      COALESCE(SUM("awardedValueCents") FILTER (WHERE status = 'WON'), 0)::bigint
        AS won_value_cents
    FROM tenders
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
  `);

  const won = Number(row?.won ?? 0);
  const lost = Number(row?.lost ?? 0);
  const decided = won + lost;

  return {
    won,
    lost,
    ratePercent: decided === 0 ? null : Math.round((won / decided) * 100),
    wonValueCents: row?.won_value_cents ?? 0n,
  };
}

export interface StatusBreakdownRow {
  status: string;
  count: number;
  valueCents: bigint;
}

export async function tendersByStatus(): Promise<StatusBreakdownRow[]> {
  const rows = await db.$queryRaw<
    Array<{ status: string; count: bigint; value_cents: bigint | null }>
  >(Prisma.sql`
    SELECT status,
           COUNT(*) AS count,
           COALESCE(SUM("estimatedValueCents"), 0)::bigint AS value_cents
    FROM tenders
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
      AND status IN ('IDENTIFIED','IN_PROGRESS','PENDING_APPROVAL','APPROVED','SUBMITTED')
    GROUP BY status
  `);

  const order = [
    "IDENTIFIED",
    "IN_PROGRESS",
    "PENDING_APPROVAL",
    "APPROVED",
    "SUBMITTED",
  ];
  return rows
    .map((r) => ({
      status: r.status,
      count: Number(r.count),
      valueCents: r.value_cents ?? 0n,
    }))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
}

export interface AttentionItem {
  kind: "closing" | "compliance" | "approval" | "checklist";
  severity: "warning" | "danger";
  label: string;
  detail: string;
  href: string;
}

/**
 * The "attention required" panel.
 *
 * Deliberately one query per concern rather than a heroic union: each is
 * independently readable, and the panel is small enough that the round trips
 * do not matter.
 */
export async function attentionRequired(): Promise<AttentionItem[]> {
  const organisationId = tenant();
  const items: AttentionItem[] = [];

  const closing = await db.$queryRaw<
    Array<{ id: string; reference: string; title: string; days: number }>
  >(Prisma.sql`
    SELECT id, reference, title,
           CEIL(EXTRACT(EPOCH FROM ("closingAt" - NOW())) / 86400)::int AS days
    FROM tenders
    WHERE "organisationId" = ${organisationId}::uuid
      AND "deletedAt" IS NULL
      AND status NOT IN ('WON','LOST','NO_BID','WITHDRAWN','SUBMITTED')
      AND "closingAt" BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    ORDER BY "closingAt" ASC
  `);
  for (const row of closing) {
    items.push({
      kind: "closing",
      severity: row.days <= 3 ? "danger" : "warning",
      label: `${row.reference} closes in ${row.days} day${row.days === 1 ? "" : "s"}`,
      detail: row.title,
      href: `/tenders/${row.id}`,
    });
  }

  const compliance = await db.$queryRaw<
    Array<{ requirementName: string; days: number }>
  >(Prisma.sql`
    SELECT "requirementName",
           CEIL(EXTRACT(EPOCH FROM ("expiresAt" - NOW())) / 86400)::int AS days
    FROM compliance_items
    WHERE "organisationId" = ${organisationId}::uuid
      AND "deletedAt" IS NULL
      AND "expiresAt" IS NOT NULL
      AND "expiresAt" < NOW() + INTERVAL '90 days'
    ORDER BY "expiresAt" ASC
  `);
  for (const row of compliance) {
    items.push({
      kind: "compliance",
      severity: row.days <= 0 ? "danger" : "warning",
      label:
        row.days <= 0
          ? `${row.requirementName} has expired`
          : `${row.requirementName} expires in ${row.days} days`,
      detail: "Company compliance",
      href: "/compliance",
    });
  }

  const approvals = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM workflow_approvals
    WHERE "organisationId" = ${organisationId}::uuid
      AND "deletedAt" IS NULL
      AND status = 'PENDING'
  `);
  const pending = Number(approvals[0]?.count ?? 0);
  if (pending > 0) {
    items.push({
      kind: "approval",
      severity: "warning",
      label: `${pending} approval${pending === 1 ? "" : "s"} outstanding`,
      detail: "Tender submissions awaiting a decision",
      href: "/approvals",
    });
  }

  const severityRank = { danger: 0, warning: 1 } as const;
  return items.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity],
  );
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export interface PipelineStageRow {
  stage: string;
  count: number;
  valueCents: bigint;
  /// value × probability, which is the number a forecast should be built on.
  weightedCents: bigint;
}

export async function pipelineByStage(): Promise<PipelineStageRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      stage: string;
      count: bigint;
      value_cents: bigint | null;
      weighted_cents: bigint | null;
    }>
  >(Prisma.sql`
    SELECT stage,
           COUNT(*) AS count,
           COALESCE(SUM("valueCents"), 0)::bigint AS value_cents,
           COALESCE(SUM(("valueCents" * probability) / 100), 0)::bigint AS weighted_cents
    FROM opportunities
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
      AND stage IN ('QUALIFIED','PROPOSAL','NEGOTIATION')
    GROUP BY stage
  `);

  const order = ["QUALIFIED", "PROPOSAL", "NEGOTIATION"];
  return rows
    .map((r) => ({
      stage: r.stage,
      count: Number(r.count),
      valueCents: r.value_cents ?? 0n,
      weightedCents: r.weighted_cents ?? 0n,
    }))
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
}

export interface CrmSummary {
  openDeals: number;
  openValueCents: bigint;
  weightedValueCents: bigint;
  /// Open leads that nobody has qualified or disqualified yet.
  unworkedLeads: number;
  wonThisYear: number;
  wonValueCentsThisYear: bigint;
  winRatePercent: number | null;
}

export async function crmSummary(): Promise<CrmSummary> {
  const organisationId = tenant();

  const [pipeline] = await db.$queryRaw<
    Array<{
      open_deals: bigint;
      open_value: bigint | null;
      weighted_value: bigint | null;
      won_count: bigint;
      lost_count: bigint;
      won_value: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE stage IN ('QUALIFIED','PROPOSAL','NEGOTIATION'))
        AS open_deals,
      COALESCE(SUM("valueCents") FILTER (
        WHERE stage IN ('QUALIFIED','PROPOSAL','NEGOTIATION')), 0)::bigint AS open_value,
      COALESCE(SUM(("valueCents" * probability) / 100) FILTER (
        WHERE stage IN ('QUALIFIED','PROPOSAL','NEGOTIATION')), 0)::bigint AS weighted_value,
      COUNT(*) FILTER (
        WHERE stage = 'WON' AND "closedAt" >= date_trunc('year', NOW())) AS won_count,
      COUNT(*) FILTER (
        WHERE stage = 'LOST' AND "closedAt" >= date_trunc('year', NOW())) AS lost_count,
      COALESCE(SUM("valueCents") FILTER (
        WHERE stage = 'WON' AND "closedAt" >= date_trunc('year', NOW())), 0)::bigint AS won_value
    FROM opportunities
    WHERE "organisationId" = ${organisationId}::uuid
      AND "deletedAt" IS NULL
  `);

  const [leads] = await db.$queryRaw<Array<{ unworked: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS unworked
    FROM leads
    WHERE "organisationId" = ${organisationId}::uuid
      AND "deletedAt" IS NULL
      AND status IN ('NEW','CONTACTED')
  `);

  const won = Number(pipeline?.won_count ?? 0);
  const lost = Number(pipeline?.lost_count ?? 0);
  const decided = won + lost;

  return {
    openDeals: Number(pipeline?.open_deals ?? 0),
    openValueCents: pipeline?.open_value ?? 0n,
    weightedValueCents: pipeline?.weighted_value ?? 0n,
    unworkedLeads: Number(leads?.unworked ?? 0),
    wonThisYear: won,
    wonValueCentsThisYear: pipeline?.won_value ?? 0n,
    winRatePercent: decided === 0 ? null : Math.round((won / decided) * 100),
  };
}

export interface LeadFunnelRow {
  status: string;
  count: number;
}

export async function leadFunnel(): Promise<LeadFunnelRow[]> {
  const rows = await db.$queryRaw<Array<{ status: string; count: bigint }>>(
    Prisma.sql`
      SELECT status, COUNT(*) AS count
      FROM leads
      WHERE "organisationId" = ${tenant()}::uuid
        AND "deletedAt" IS NULL
      GROUP BY status
    `,
  );

  const order = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "DISQUALIFIED"];
  return rows
    .map((r) => ({ status: r.status, count: Number(r.count) }))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
}

export interface ComplianceSummary {
  total: number;
  valid: number;
  expiringSoon: number;
  expired: number;
  percentValid: number;
}

/**
 * Compliance status is computed from expiresAt, never stored (ADR-004).
 * The same query will serve HR and HSE once those modules exist.
 */
export async function complianceSummary(): Promise<ComplianceSummary> {
  const [row] = await db.$queryRaw<
    Array<{ total: bigint; valid: bigint; expiring: bigint; expired: bigint }>
  >(Prisma.sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE "expiresAt" > NOW() + INTERVAL '90 days') AS valid,
      COUNT(*) FILTER (
        WHERE "expiresAt" > NOW() AND "expiresAt" <= NOW() + INTERVAL '90 days'
      ) AS expiring,
      COUNT(*) FILTER (WHERE "expiresAt" <= NOW()) AS expired
    FROM compliance_items
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
      AND "expiresAt" IS NOT NULL
  `);

  const total = Number(row?.total ?? 0);
  const valid = Number(row?.valid ?? 0);
  return {
    total,
    valid,
    expiringSoon: Number(row?.expiring ?? 0),
    expired: Number(row?.expired ?? 0),
    percentValid: total === 0 ? 100 : Math.round((valid / total) * 100),
  };
}
