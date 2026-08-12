import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import {
  attentionRequired,
  complianceSummary,
  crmSummary,
  tenderPipelineSummary,
  tenderWinRate,
  tendersByStatus,
} from "@/lib/analytics/metrics";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { formatCentsCompact, tenderStatusLabel } from "@/lib/format";

/**
 * The executive dashboard.
 *
 * Every tile reads from the metrics layer, never from Prisma directly
 * (ADR-005). Widgets are still hard-coded here; making them configurable per
 * role is Phase 8, deliberately.
 */

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-ZA", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Johannesburg",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const data = await withSession(async (session) => ({
    session,
    pipeline: await tenderPipelineSummary(),
    winRate: await tenderWinRate(),
    byStatus: await tendersByStatus(),
    attention: await attentionRequired(),
    compliance: await complianceSummary(),
    crm: await crmSummary(),
  }));

  const { pipeline, winRate, byStatus, attention, compliance, crm } = data;
  const maxCount = Math.max(1, ...byStatus.map((r) => r.count));

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${data.session.fullName.split(" ")[0]}`}
        description={data.session.roleNames.join(" · ")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open pipeline"
          value={formatCentsCompact(pipeline.openValueCents)}
          hint={`${pipeline.openCount} live tenders`}
        />
        <StatTile
          label="Awaiting approval"
          value={String(pipeline.awaitingApproval)}
          hint="Submissions needing a decision"
          tone={pipeline.awaitingApproval > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Closing in 7 days"
          value={String(pipeline.closingWithin7Days)}
          hint="Deadlines this week"
          tone={pipeline.closingWithin7Days > 0 ? "danger" : "default"}
        />
        <StatTile
          label="Win rate"
          value={winRate.ratePercent === null ? "—" : `${winRate.ratePercent}%`}
          hint={`${winRate.won} won · ${winRate.lost} lost`}
          tone="success"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Sales pipeline"
          value={formatCentsCompact(crm.openValueCents)}
          hint={`${crm.openDeals} open deals`}
        />
        <StatTile
          label="Weighted forecast"
          value={formatCentsCompact(crm.weightedValueCents)}
          hint="Value × probability"
          tone="success"
        />
        <StatTile
          label="Unworked leads"
          value={String(crm.unworkedLeads)}
          hint="Not yet qualified"
          tone={crm.unworkedLeads > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Won this year"
          value={formatCentsCompact(crm.wonValueCentsThisYear)}
          hint={`${crm.wonThisYear} deals · ${
            crm.winRatePercent === null ? "—" : `${crm.winRatePercent}% win rate`
          }`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Tender pipeline"
            description="Live tenders by stage, excluding closed bids"
          />
          <div className="space-y-3 px-5 py-4">
            {byStatus.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">
                No live tenders.
              </p>
            )}
            {byStatus.map((row) => (
              <div key={row.status} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-xs text-muted">
                  {tenderStatusLabel(row.status)}
                </span>
                <div className="h-6 flex-1 overflow-hidden rounded bg-surface-muted">
                  <div
                    className="flex h-full items-center rounded bg-accent px-2"
                    style={{ width: `${(row.count / maxCount) * 100}%` }}
                  >
                    <span className="tabular text-[11px] font-semibold text-accent-foreground">
                      {row.count}
                    </span>
                  </div>
                </div>
                <span className="tabular w-16 shrink-0 text-right text-xs text-muted">
                  {formatCentsCompact(row.valueCents)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Company compliance"
            description="Computed from expiry dates, never stored"
          />
          <div className="px-5 py-4">
            <div className="flex items-baseline gap-2">
              <span className="tabular text-3xl font-semibold">
                {compliance.percentValid}%
              </span>
              <span className="text-xs text-muted">valid</span>
            </div>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="bg-success"
                style={{ width: `${(compliance.valid / Math.max(1, compliance.total)) * 100}%` }}
              />
              <div
                className="bg-warning"
                style={{ width: `${(compliance.expiringSoon / Math.max(1, compliance.total)) * 100}%` }}
              />
              <div
                className="bg-danger"
                style={{ width: `${(compliance.expired / Math.max(1, compliance.total)) * 100}%` }}
              />
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted">Valid</dt>
                <dd className="tabular font-medium">{compliance.valid}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Expiring within 90 days</dt>
                <dd className="tabular font-medium text-warning">
                  {compliance.expiringSoon}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Expired</dt>
                <dd className="tabular font-medium text-danger">
                  {compliance.expired}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Attention required"
          description="Deadlines, expiries and outstanding decisions"
          action={
            <Badge tone={attention.length > 0 ? "warning" : "success"}>
              {attention.length} item{attention.length === 1 ? "" : "s"}
            </Badge>
          }
        />
        {attention.length === 0 ? (
          <EmptyState
            title="Nothing needs attention"
            description="No deadlines this week, no expired compliance, no outstanding approvals."
          />
        ) : (
          <ul className="divide-y divide-border">
            {attention.map((item, index) => (
              <li key={`${item.kind}-${index}`}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-muted"
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${
                      item.severity === "danger" ? "bg-danger" : "bg-warning"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {item.detail}
                    </span>
                  </span>
                  <span className="text-xs text-muted">View</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
