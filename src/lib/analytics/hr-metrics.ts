import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { Prisma } from "@/generated/prisma/client";

/**
 * HR metrics (ADR-005).
 *
 * Same contract as the rest of the metrics layer: named SQL, typed results,
 * and organisationId filtered explicitly because raw SQL bypasses the tenancy
 * extension.
 *
 * Certifications are not a table of their own. An employee's tickets are
 * compliance_items rows with entityType EMPLOYEE, which is the same machinery
 * that watches the company's tax clearance and CIDB grading — so the expiry
 * sweep, the warning thresholds and the audit trail were already built.
 */

function tenant(): string {
  return requireRequestContext().organisationId;
}

export interface Headcount {
  active: number;
  onLeave: number;
  exited: number;
  permanent: number;
  nonPermanent: number;
  withoutLogin: number;
}

export async function headcount(): Promise<Headcount> {
  const [row] = await db.$queryRaw<
    Array<{
      active: bigint;
      on_leave: bigint;
      exited: bigint;
      permanent: bigint;
      non_permanent: bigint;
      without_login: bigint;
    }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE status <> 'EXITED') AS active,
      COUNT(*) FILTER (WHERE status = 'ON_LEAVE') AS on_leave,
      COUNT(*) FILTER (WHERE status = 'EXITED') AS exited,
      COUNT(*) FILTER (
        WHERE status <> 'EXITED' AND "employmentType" = 'PERMANENT'
      ) AS permanent,
      COUNT(*) FILTER (
        WHERE status <> 'EXITED' AND "employmentType" <> 'PERMANENT'
      ) AS non_permanent,
      COUNT(*) FILTER (
        WHERE status <> 'EXITED' AND "userId" IS NULL
      ) AS without_login
    FROM employees
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
  `);

  return {
    active: Number(row?.active ?? 0),
    onLeave: Number(row?.on_leave ?? 0),
    exited: Number(row?.exited ?? 0),
    permanent: Number(row?.permanent ?? 0),
    nonPermanent: Number(row?.non_permanent ?? 0),
    withoutLogin: Number(row?.without_login ?? 0),
  };
}

export interface CertificationRow {
  id: string;
  requirementName: string;
  category: string;
  expiresAt: Date;
  employeeId: string;
  holderName: string;
}

export interface ExpiringCertifications {
  expired: CertificationRow[];
  soon: CertificationRow[];
}

/**
 * Employee tickets that have lapsed or are about to.
 *
 * Exited employees are excluded: their expired first-aid certificate is not a
 * site risk, and leaving it in the list trains people to ignore the list.
 */
export async function expiringCertifications(
  withinDays = 90,
): Promise<ExpiringCertifications> {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      requirement_name: string;
      category: string;
      expires_at: Date;
      employee_id: string;
      holder_name: string;
    }>
  >(Prisma.sql`
    SELECT
      c.id,
      c."requirementName" AS requirement_name,
      c.category::text AS category,
      c."expiresAt" AS expires_at,
      e.id AS employee_id,
      e."firstName" || ' ' || e."lastName" AS holder_name
    FROM compliance_items c
    JOIN employees e
      ON e.id = c."entityId"
     AND e."organisationId" = c."organisationId"
    WHERE c."organisationId" = ${tenant()}::uuid
      AND c."entityType" = 'EMPLOYEE'
      AND c."deletedAt" IS NULL
      AND e."deletedAt" IS NULL
      AND e.status <> 'EXITED'
      AND c."expiresAt" IS NOT NULL
      AND c."expiresAt" <= NOW() + (${withinDays} || ' days')::interval
    ORDER BY c."expiresAt" ASC
  `);

  const mapped: CertificationRow[] = rows.map((row) => ({
    id: row.id,
    requirementName: row.requirement_name,
    category: row.category,
    expiresAt: row.expires_at,
    employeeId: row.employee_id,
    holderName: row.holder_name,
  }));

  const now = new Date();
  return {
    expired: mapped.filter((row) => row.expiresAt <= now),
    soon: mapped.filter((row) => row.expiresAt > now),
  };
}

/** Certifications for one person, newest expiry last. */
export async function certificationsFor(
  employeeId: string,
): Promise<CertificationRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      requirement_name: string;
      category: string;
      expires_at: Date | null;
      employee_id: string;
      holder_name: string;
    }>
  >(Prisma.sql`
    SELECT
      c.id,
      c."requirementName" AS requirement_name,
      c.category::text AS category,
      c."expiresAt" AS expires_at,
      e.id AS employee_id,
      e."firstName" || ' ' || e."lastName" AS holder_name
    FROM compliance_items c
    JOIN employees e
      ON e.id = c."entityId"
     AND e."organisationId" = c."organisationId"
    WHERE c."organisationId" = ${tenant()}::uuid
      AND c."entityType" = 'EMPLOYEE'
      AND c."entityId" = ${employeeId}::uuid
      AND c."deletedAt" IS NULL
    ORDER BY c."expiresAt" ASC NULLS LAST
  `);

  return rows
    .filter((row) => row.expires_at !== null)
    .map((row) => ({
      id: row.id,
      requirementName: row.requirement_name,
      category: row.category,
      expiresAt: row.expires_at as Date,
      employeeId: row.employee_id,
      holderName: row.holder_name,
    }));
}

export interface LeaveSummary {
  pendingRequests: number;
  awayToday: number;
  awayNext14Days: number;
}

export async function leaveSummary(): Promise<LeaveSummary> {
  const [row] = await db.$queryRaw<
    Array<{ pending: bigint; away_today: bigint; away_soon: bigint }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'SUBMITTED') AS pending,
      COUNT(*) FILTER (
        WHERE status = 'APPROVED'
          AND "startsAt" <= NOW() AND "endsAt" >= NOW()
      ) AS away_today,
      COUNT(*) FILTER (
        WHERE status = 'APPROVED'
          AND "startsAt" <= NOW() + INTERVAL '14 days'
          AND "endsAt" >= NOW()
      ) AS away_soon
    FROM leave_requests
    WHERE "organisationId" = ${tenant()}::uuid
      AND "deletedAt" IS NULL
  `);

  return {
    pendingRequests: Number(row?.pending ?? 0),
    awayToday: Number(row?.away_today ?? 0),
    awayNext14Days: Number(row?.away_soon ?? 0),
  };
}
