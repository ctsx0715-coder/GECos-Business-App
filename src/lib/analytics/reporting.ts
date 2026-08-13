import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { Prisma } from "@/generated/prisma/client";

/**
 * Opportunity and tender level reporting (ADR-005).
 *
 * The metrics in metrics.ts answer "how is the business doing right now".
 * These answer the harder question a tendering company lives on: *which bids
 * are worth chasing*, and *what happened to the ones we chased*.
 *
 * Same rules as the rest of the metrics layer. Raw SQL, because Prisma is poor
 * at aggregation; organisationId taken from the request context and filtered
 * explicitly in every statement, because raw SQL bypasses the tenancy
 * extension; and one reviewed file rather than queries scattered through page
 * components.
 */

function tenant(): string {
  return requireRequestContext().organisationId;
}

// ---------------------------------------------------------------------------
// Pipeline conversion
// ---------------------------------------------------------------------------

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  valueCents: bigint;
  /** Percentage of the stage above, or null for the first stage. */
  conversionPercent: number | null;
}

/**
 * The bid funnel: discovered → qualified → submitted → won.
 *
 * Counts are cumulative rather than "currently sitting in this stage" — a won
 * tender was also discovered, qualified and submitted, and a funnel that
 * forgets that reports a 3% qualification rate for a healthy business.
 */
export async function bidFunnel(): Promise<FunnelStage[]> {
  const [row] = await db.$queryRaw<
    Array<{
      discovered: bigint;
      discovered_value: bigint | null;
      qualified: bigint;
      qualified_value: bigint | null;
      submitted: bigint;
      submitted_value: bigint | null;
      won: bigint;
      won_value: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(*) AS discovered,
      COALESCE(SUM("estimatedValueCents"), 0)::bigint AS discovered_value,

      COUNT(*) FILTER (WHERE status <> 'NO_BID') AS qualified,
      COALESCE(SUM("estimatedValueCents") FILTER (
        WHERE status <> 'NO_BID'), 0)::bigint AS qualified_value,

      COUNT(*) FILTER (WHERE status IN ('SUBMITTED','WON','LOST')) AS submitted,
      COALESCE(SUM("estimatedValueCents") FILTER (
        WHERE status IN ('SUBMITTED','WON','LOST')), 0)::bigint AS submitted_value,

      COUNT(*) FILTER (WHERE status = 'WON') AS won,
      COALESCE(SUM(COALESCE("awardedValueCents", "estimatedValueCents")) FILTER (
        WHERE status = 'WON'), 0)::bigint AS won_value
    FROM tenders
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
  `);

  const stages = [
    {
      key: "discovered",
      label: "Discovered",
      count: Number(row?.discovered ?? 0),
      valueCents: row?.discovered_value ?? 0n,
    },
    {
      key: "qualified",
      label: "Qualified",
      count: Number(row?.qualified ?? 0),
      valueCents: row?.qualified_value ?? 0n,
    },
    {
      key: "submitted",
      label: "Submitted",
      count: Number(row?.submitted ?? 0),
      valueCents: row?.submitted_value ?? 0n,
    },
    {
      key: "won",
      label: "Won",
      count: Number(row?.won ?? 0),
      valueCents: row?.won_value ?? 0n,
    },
  ];

  return stages.map((stage, index) => {
    const previous = stages[index - 1];
    return {
      ...stage,
      conversionPercent:
        !previous || previous.count === 0
          ? null
          : Math.round((stage.count / previous.count) * 100),
    };
  });
}

// ---------------------------------------------------------------------------
// Win/loss cuts
// ---------------------------------------------------------------------------

export interface SegmentPerformance {
  segment: string;
  bids: number;
  won: number;
  lost: number;
  open: number;
  winRatePercent: number | null;
  submittedValueCents: bigint;
  wonValueCents: bigint;
}

function toSegment(row: {
  segment: string | null;
  bids: bigint;
  won: bigint;
  lost: bigint;
  open: bigint;
  submitted_value: bigint | null;
  won_value: bigint | null;
}): SegmentPerformance {
  const won = Number(row.won);
  const lost = Number(row.lost);
  const decided = won + lost;
  return {
    segment: row.segment ?? "Unclassified",
    bids: Number(row.bids),
    won,
    lost,
    open: Number(row.open),
    winRatePercent: decided === 0 ? null : Math.round((won / decided) * 100),
    submittedValueCents: row.submitted_value ?? 0n,
    wonValueCents: row.won_value ?? 0n,
  };
}

/** Which sectors we actually win in. */
export async function winLossByIndustry(): Promise<SegmentPerformance[]> {
  const rows = await db.$queryRaw<
    Array<{
      segment: string | null;
      bids: bigint;
      won: bigint;
      lost: bigint;
      open: bigint;
      submitted_value: bigint | null;
      won_value: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      industry AS segment,
      COUNT(*) AS bids,
      COUNT(*) FILTER (WHERE status = 'WON')  AS won,
      COUNT(*) FILTER (WHERE status = 'LOST') AS lost,
      COUNT(*) FILTER (
        WHERE status NOT IN ('WON','LOST','NO_BID','WITHDRAWN')) AS open,
      COALESCE(SUM("estimatedValueCents") FILTER (
        WHERE status IN ('SUBMITTED','WON','LOST')), 0)::bigint AS submitted_value,
      COALESCE(SUM(COALESCE("awardedValueCents", "estimatedValueCents")) FILTER (
        WHERE status = 'WON'), 0)::bigint AS won_value
    FROM tenders
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
    GROUP BY industry
    ORDER BY COUNT(*) DESC
  `);

  return rows.map(toSegment);
}

/** Which buyers award us work, and which keep taking our time. */
export async function winLossByClient(): Promise<
  Array<SegmentPerformance & { isPublicSector: boolean }>
> {
  const rows = await db.$queryRaw<
    Array<{
      segment: string | null;
      is_public_sector: boolean;
      bids: bigint;
      won: bigint;
      lost: bigint;
      open: bigint;
      submitted_value: bigint | null;
      won_value: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      c.name AS segment,
      c."isPublicSector" AS is_public_sector,
      COUNT(*) AS bids,
      COUNT(*) FILTER (WHERE t.status = 'WON')  AS won,
      COUNT(*) FILTER (WHERE t.status = 'LOST') AS lost,
      COUNT(*) FILTER (
        WHERE t.status NOT IN ('WON','LOST','NO_BID','WITHDRAWN')) AS open,
      COALESCE(SUM(t."estimatedValueCents") FILTER (
        WHERE t.status IN ('SUBMITTED','WON','LOST')), 0)::bigint AS submitted_value,
      COALESCE(SUM(COALESCE(t."awardedValueCents", t."estimatedValueCents")) FILTER (
        WHERE t.status = 'WON'), 0)::bigint AS won_value
    FROM tenders t
    JOIN customers c ON c.id = t."customerId"
    WHERE t."organisationId" = ${tenant()}::uuid
      AND t."deletedAt" IS NULL
      AND c."deletedAt" IS NULL
    GROUP BY c.name, c."isPublicSector"
    ORDER BY COUNT(*) DESC
  `);

  return rows.map((row) => ({
    ...toSegment(row),
    isPublicSector: row.is_public_sector,
  }));
}

/**
 * Win rate by contract size.
 *
 * Usually the most actionable cut of the lot: most contractors have a band
 * they win in and a band where they are making up the numbers, and nobody
 * knows which is which until it is counted.
 */
export async function winLossByValueBand(): Promise<SegmentPerformance[]> {
  const rows = await db.$queryRaw<
    Array<{
      segment: string | null;
      sort_order: number;
      bids: bigint;
      won: bigint;
      lost: bigint;
      open: bigint;
      submitted_value: bigint | null;
      won_value: bigint | null;
    }>
  >(Prisma.sql`
    WITH banded AS (
      SELECT
        CASE
          WHEN "estimatedValueCents" IS NULL          THEN 'Unpriced'
          WHEN "estimatedValueCents" <   100000000    THEN 'Under R1m'
          WHEN "estimatedValueCents" <   500000000    THEN 'R1m – R5m'
          WHEN "estimatedValueCents" <  2000000000    THEN 'R5m – R20m'
          WHEN "estimatedValueCents" < 10000000000    THEN 'R20m – R100m'
          ELSE 'Over R100m'
        END AS segment,
        CASE
          WHEN "estimatedValueCents" IS NULL          THEN 5
          WHEN "estimatedValueCents" <   100000000    THEN 0
          WHEN "estimatedValueCents" <   500000000    THEN 1
          WHEN "estimatedValueCents" <  2000000000    THEN 2
          WHEN "estimatedValueCents" < 10000000000    THEN 3
          ELSE 4
        END AS sort_order,
        status,
        "estimatedValueCents",
        "awardedValueCents"
      FROM tenders
      WHERE "organisationId" = ${tenant()}::uuid
        AND "deletedAt" IS NULL
    )
    SELECT
      segment,
      sort_order,
      COUNT(*) AS bids,
      COUNT(*) FILTER (WHERE status = 'WON')  AS won,
      COUNT(*) FILTER (WHERE status = 'LOST') AS lost,
      COUNT(*) FILTER (
        WHERE status NOT IN ('WON','LOST','NO_BID','WITHDRAWN')) AS open,
      COALESCE(SUM("estimatedValueCents") FILTER (
        WHERE status IN ('SUBMITTED','WON','LOST')), 0)::bigint AS submitted_value,
      COALESCE(SUM(COALESCE("awardedValueCents", "estimatedValueCents")) FILTER (
        WHERE status = 'WON'), 0)::bigint AS won_value
    FROM banded
    GROUP BY segment, sort_order
    ORDER BY sort_order
  `);

  return rows.map(toSegment);
}

export interface MonthlyBidRow {
  month: string;
  submitted: number;
  won: number;
  lost: number;
  wonValueCents: bigint;
}

/** Twelve months of outcomes, so the trend has a shape rather than a point. */
export async function monthlyBidTrend(): Promise<MonthlyBidRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      month: Date;
      submitted: bigint;
      won: bigint;
      lost: bigint;
      won_value: bigint | null;
    }>
  >(Prisma.sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', NOW()) - INTERVAL '11 months',
        date_trunc('month', NOW()),
        INTERVAL '1 month'
      ) AS month
    )
    SELECT
      m.month,
      COUNT(t.id) FILTER (
        WHERE date_trunc('month', t."submittedAt") = m.month) AS submitted,
      COUNT(t.id) FILTER (
        WHERE t.status = 'WON'
          AND date_trunc('month', t."outcomeAt") = m.month) AS won,
      COUNT(t.id) FILTER (
        WHERE t.status = 'LOST'
          AND date_trunc('month', t."outcomeAt") = m.month) AS lost,
      COALESCE(SUM(COALESCE(t."awardedValueCents", t."estimatedValueCents")) FILTER (
        WHERE t.status = 'WON'
          AND date_trunc('month', t."outcomeAt") = m.month), 0)::bigint AS won_value
    FROM months m
    LEFT JOIN tenders t
      ON t."organisationId" = ${tenant()}::uuid
     AND t."deletedAt" IS NULL
     AND (
       date_trunc('month', t."submittedAt") = m.month
       OR date_trunc('month', t."outcomeAt") = m.month
     )
    GROUP BY m.month
    ORDER BY m.month
  `);

  return rows.map((row) => ({
    month: new Intl.DateTimeFormat("en-ZA", {
      month: "short",
      year: "2-digit",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(row.month)),
    submitted: Number(row.submitted),
    won: Number(row.won),
    lost: Number(row.lost),
    wonValueCents: row.won_value ?? 0n,
  }));
}

// ---------------------------------------------------------------------------
// Single-tender reporting
// ---------------------------------------------------------------------------

export interface TenderReportFacts {
  requirementsTotal: number;
  requirementsSatisfied: number;
  mandatoryTotal: number;
  mandatorySatisfied: number;
  approvalsTotal: number;
  approvalsDecided: number;
  auditEvents: number;
  /**
   * Days from the earliest date held for the tender to its outcome, or to now
   * while it is still live.
   */
  daysOpen: number;
  daysToClosing: number | null;
  linkedOpportunities: number;
  linkedProjects: number;
}

/**
 * The facts behind a single tender's report, in one round trip.
 *
 * Deliberately counts rather than rows: the report page already has the tender
 * and its requirements from the service, and re-fetching them here would mean
 * two sources of truth for the same screen.
 */
export async function tenderReportFacts(
  tenderId: string,
): Promise<TenderReportFacts> {
  const organisationId = tenant();

  const [row] = await db.$queryRaw<
    Array<{
      requirements_total: bigint;
      requirements_satisfied: bigint;
      mandatory_total: bigint;
      mandatory_satisfied: bigint;
      approvals_total: bigint;
      approvals_decided: bigint;
      audit_events: bigint;
      days_open: number | null;
      days_to_closing: number | null;
      linked_opportunities: bigint;
      linked_projects: bigint;
    }>
  >(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM tender_requirements r
        WHERE r."tenderId" = ${tenderId}::uuid AND r."deletedAt" IS NULL)
        AS requirements_total,
      (SELECT COUNT(*) FROM tender_requirements r
        WHERE r."tenderId" = ${tenderId}::uuid AND r."deletedAt" IS NULL
          AND r."satisfiedAt" IS NOT NULL)
        AS requirements_satisfied,
      (SELECT COUNT(*) FROM tender_requirements r
        WHERE r."tenderId" = ${tenderId}::uuid AND r."deletedAt" IS NULL
          AND r."isMandatory")
        AS mandatory_total,
      (SELECT COUNT(*) FROM tender_requirements r
        WHERE r."tenderId" = ${tenderId}::uuid AND r."deletedAt" IS NULL
          AND r."isMandatory" AND r."satisfiedAt" IS NOT NULL)
        AS mandatory_satisfied,
      (SELECT COUNT(*) FROM workflow_approvals a
        JOIN workflow_instances i ON i.id = a."workflowInstanceId"
        WHERE a."organisationId" = ${organisationId}::uuid
          AND i."entityType" = 'TENDER' AND i."entityId" = ${tenderId}::uuid
          AND a."deletedAt" IS NULL)
        AS approvals_total,
      (SELECT COUNT(*) FROM workflow_approvals a
        JOIN workflow_instances i ON i.id = a."workflowInstanceId"
        WHERE a."organisationId" = ${organisationId}::uuid
          AND i."entityType" = 'TENDER' AND i."entityId" = ${tenderId}::uuid
          AND a."deletedAt" IS NULL AND a.status <> 'PENDING')
        AS approvals_decided,
      -- audit_logs.entityId is text, not uuid: it records composite keys too.
      (SELECT COUNT(*) FROM audit_logs l
        WHERE l."entityType" = 'Tender' AND l."entityId" = ${tenderId}
          AND l."organisationId" = ${organisationId}::uuid)
        AS audit_events,
      -- The bid window runs from the earliest date we hold for the tender to
      -- its outcome, or to now while it is still live. Deliberately not
      -- createdAt alone: a tender captured after the fact — or seeded — has a
      -- createdAt later than its own closing date, which produced a negative
      -- number of days on the report.
      (SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
                COALESCE(t."outcomeAt", NOW())
                - LEAST(t."createdAt", t."closingAt",
                        COALESCE(t."submittedAt", t."createdAt")))) / 86400)::int)
         FROM tenders t WHERE t.id = ${tenderId}::uuid)
        AS days_open,
      (SELECT CEIL(EXTRACT(EPOCH FROM (t."closingAt" - NOW())) / 86400)::int
         FROM tenders t WHERE t.id = ${tenderId}::uuid)
        AS days_to_closing,
      (SELECT COUNT(*) FROM opportunities o
        WHERE o."tenderId" = ${tenderId}::uuid AND o."deletedAt" IS NULL)
        AS linked_opportunities,
      (SELECT COUNT(*) FROM projects p
        WHERE p."tenderId" = ${tenderId}::uuid AND p."deletedAt" IS NULL)
        AS linked_projects
  `);

  return {
    requirementsTotal: Number(row?.requirements_total ?? 0),
    requirementsSatisfied: Number(row?.requirements_satisfied ?? 0),
    mandatoryTotal: Number(row?.mandatory_total ?? 0),
    mandatorySatisfied: Number(row?.mandatory_satisfied ?? 0),
    approvalsTotal: Number(row?.approvals_total ?? 0),
    approvalsDecided: Number(row?.approvals_decided ?? 0),
    auditEvents: Number(row?.audit_events ?? 0),
    daysOpen: Number(row?.days_open ?? 0),
    daysToClosing:
      row?.days_to_closing === null || row?.days_to_closing === undefined
        ? null
        : Number(row.days_to_closing),
    linkedOpportunities: Number(row?.linked_opportunities ?? 0),
    linkedProjects: Number(row?.linked_projects ?? 0),
  };
}

export interface TrackRecord {
  bids: number;
  won: number;
  lost: number;
  winRatePercent: number | null;
  awardedValueCents: bigint;
}

/**
 * Our history with one buyer, excluding the bid being reported on.
 *
 * "We have bid eleven times here and won twice" is the single most useful
 * sentence on a tender report, and it is the one nobody has to hand.
 */
export async function clientTrackRecord(
  customerId: string,
  excludeTenderId?: string,
): Promise<TrackRecord> {
  const [row] = await db.$queryRaw<
    Array<{
      bids: bigint;
      won: bigint;
      lost: bigint;
      awarded_value: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(*) AS bids,
      COUNT(*) FILTER (WHERE status = 'WON')  AS won,
      COUNT(*) FILTER (WHERE status = 'LOST') AS lost,
      COALESCE(SUM(COALESCE("awardedValueCents", "estimatedValueCents")) FILTER (
        WHERE status = 'WON'), 0)::bigint AS awarded_value
    FROM tenders
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
      AND "customerId" = ${customerId}::uuid
      AND (${excludeTenderId ?? null}::uuid IS NULL
           OR id <> ${excludeTenderId ?? null}::uuid)
  `);

  return toTrackRecord(row);
}

/** The same question asked of a sector rather than a buyer. */
export async function industryTrackRecord(
  industry: string,
  excludeTenderId?: string,
): Promise<TrackRecord> {
  const [row] = await db.$queryRaw<
    Array<{
      bids: bigint;
      won: bigint;
      lost: bigint;
      awarded_value: bigint | null;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(*) AS bids,
      COUNT(*) FILTER (WHERE status = 'WON')  AS won,
      COUNT(*) FILTER (WHERE status = 'LOST') AS lost,
      COALESCE(SUM(COALESCE("awardedValueCents", "estimatedValueCents")) FILTER (
        WHERE status = 'WON'), 0)::bigint AS awarded_value
    FROM tenders
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
      AND industry = ${industry}
      AND (${excludeTenderId ?? null}::uuid IS NULL
           OR id <> ${excludeTenderId ?? null}::uuid)
  `);

  return toTrackRecord(row);
}

function toTrackRecord(row?: {
  bids: bigint;
  won: bigint;
  lost: bigint;
  awarded_value: bigint | null;
}): TrackRecord {
  const won = Number(row?.won ?? 0);
  const lost = Number(row?.lost ?? 0);
  const decided = won + lost;
  return {
    bids: Number(row?.bids ?? 0),
    won,
    lost,
    winRatePercent: decided === 0 ? null : Math.round((won / decided) * 100),
    awardedValueCents: row?.awarded_value ?? 0n,
  };
}

// ---------------------------------------------------------------------------
// Single-opportunity reporting
// ---------------------------------------------------------------------------

export interface OpportunityReportFacts {
  activities: number;
  lastActivityAt: Date | null;
  daysInPipeline: number;
  daysSinceLastActivity: number | null;
  daysToExpectedClose: number | null;
  weightedValueCents: bigint;
  linkedProjects: number;
  /** Other open deals with the same customer, excluding this one. */
  siblingOpenDeals: number;
}

export async function opportunityReportFacts(
  opportunityId: string,
): Promise<OpportunityReportFacts> {
  const organisationId = tenant();

  const [row] = await db.$queryRaw<
    Array<{
      activities: bigint;
      last_activity_at: Date | null;
      days_in_pipeline: number | null;
      days_since_activity: number | null;
      days_to_close: number | null;
      weighted_value: bigint | null;
      linked_projects: bigint;
      sibling_open_deals: bigint;
    }>
  >(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM activities a
        WHERE a."organisationId" = ${organisationId}::uuid
          AND a."deletedAt" IS NULL
          AND a."entityType" = 'OPPORTUNITY'
          AND a."entityId" = ${opportunityId}::uuid)
        AS activities,
      (SELECT MAX(a."occurredAt") FROM activities a
        WHERE a."organisationId" = ${organisationId}::uuid
          AND a."deletedAt" IS NULL
          AND a."entityType" = 'OPPORTUNITY'
          AND a."entityId" = ${opportunityId}::uuid)
        AS last_activity_at,
      (SELECT CEIL(EXTRACT(EPOCH FROM (
                COALESCE(o."closedAt", NOW()) - o."createdAt")) / 86400)::int
         FROM opportunities o WHERE o.id = ${opportunityId}::uuid)
        AS days_in_pipeline,
      (SELECT CEIL(EXTRACT(EPOCH FROM (NOW() - MAX(a."occurredAt"))) / 86400)::int
         FROM activities a
        WHERE a."organisationId" = ${organisationId}::uuid
          AND a."deletedAt" IS NULL
          AND a."entityType" = 'OPPORTUNITY'
          AND a."entityId" = ${opportunityId}::uuid)
        AS days_since_activity,
      (SELECT CEIL(EXTRACT(EPOCH FROM (o."expectedCloseAt" - NOW())) / 86400)::int
         FROM opportunities o WHERE o.id = ${opportunityId}::uuid)
        AS days_to_close,
      (SELECT COALESCE((o."valueCents" * o.probability) / 100, 0)::bigint
         FROM opportunities o WHERE o.id = ${opportunityId}::uuid)
        AS weighted_value,
      (SELECT COUNT(*) FROM projects p
        WHERE p."opportunityId" = ${opportunityId}::uuid AND p."deletedAt" IS NULL)
        AS linked_projects,
      (SELECT COUNT(*) FROM opportunities s
        WHERE s."organisationId" = ${organisationId}::uuid
          AND s."deletedAt" IS NULL
          AND s.id <> ${opportunityId}::uuid
          AND s.stage IN ('QUALIFIED','PROPOSAL','NEGOTIATION')
          AND s."customerId" = (
            SELECT o."customerId" FROM opportunities o
             WHERE o.id = ${opportunityId}::uuid))
        AS sibling_open_deals
  `);

  return {
    activities: Number(row?.activities ?? 0),
    lastActivityAt: row?.last_activity_at ?? null,
    daysInPipeline: Number(row?.days_in_pipeline ?? 0),
    daysSinceLastActivity:
      row?.days_since_activity === null || row?.days_since_activity === undefined
        ? null
        : Number(row.days_since_activity),
    daysToExpectedClose:
      row?.days_to_close === null || row?.days_to_close === undefined
        ? null
        : Number(row.days_to_close),
    weightedValueCents: row?.weighted_value ?? 0n,
    linkedProjects: Number(row?.linked_projects ?? 0),
    siblingOpenDeals: Number(row?.sibling_open_deals ?? 0),
  };
}

export interface CustomerDealHistory {
  won: number;
  lost: number;
  open: number;
  winRatePercent: number | null;
  wonValueCents: bigint;
  /** Median days from creation to close, over decided deals. */
  medianDaysToClose: number | null;
}

/** How deals with this customer have historically gone. */
export async function customerDealHistory(
  customerId: string,
  excludeOpportunityId?: string,
): Promise<CustomerDealHistory> {
  const [row] = await db.$queryRaw<
    Array<{
      won: bigint;
      lost: bigint;
      open: bigint;
      won_value: bigint | null;
      median_days: number | null;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE stage = 'WON')  AS won,
      COUNT(*) FILTER (WHERE stage = 'LOST') AS lost,
      COUNT(*) FILTER (WHERE stage IN ('QUALIFIED','PROPOSAL','NEGOTIATION'))
        AS open,
      COALESCE(SUM("valueCents") FILTER (WHERE stage = 'WON'), 0)::bigint
        AS won_value,
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM ("closedAt" - "createdAt")) / 86400
      ) FILTER (WHERE "closedAt" IS NOT NULL)::int AS median_days
    FROM opportunities
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
      AND "customerId" = ${customerId}::uuid
      AND (${excludeOpportunityId ?? null}::uuid IS NULL
           OR id <> ${excludeOpportunityId ?? null}::uuid)
  `);

  const won = Number(row?.won ?? 0);
  const lost = Number(row?.lost ?? 0);
  const decided = won + lost;

  return {
    won,
    lost,
    open: Number(row?.open ?? 0),
    winRatePercent: decided === 0 ? null : Math.round((won / decided) * 100),
    wonValueCents: row?.won_value ?? 0n,
    medianDaysToClose:
      row?.median_days === null || row?.median_days === undefined
        ? null
        : Number(row.median_days),
  };
}
