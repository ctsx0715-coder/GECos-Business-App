import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import {
  bidFunnel,
  monthlyBidTrend,
  winLossByClient,
  winLossByIndustry,
  winLossByValueBand,
  type SegmentPerformance,
} from "@/lib/analytics/reporting";
import { tenderWinRate } from "@/lib/analytics/metrics";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { ComingSoon, DataTable, Meter } from "@/components/ui/preview";
import { formatCentsCompact } from "@/lib/format";

/**
 * Reporting across the bid book.
 *
 * The dashboard answers "what is happening today". This answers the questions
 * a tendering business is actually run on: what converts, where we win, which
 * buyers are worth the effort, and what size of contract we are competent at.
 *
 * Every figure is computed from the tenant's own tenders through the metrics
 * layer (ADR-005) — no page here touches Prisma directly.
 */

function winRateTone(percent: number | null) {
  if (percent === null) return "neutral" as const;
  if (percent >= 40) return "success" as const;
  if (percent >= 20) return "warning" as const;
  return "danger" as const;
}

function SegmentTable({
  rows,
  header,
}: {
  rows: Array<SegmentPerformance & { isPublicSector?: boolean }>;
  header: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to report yet"
        description="Tenders need outcomes recorded before this cut means anything."
      />
    );
  }

  return (
    <DataTable
      head={
        <>
          <th className="px-5 py-3 font-medium">{header}</th>
          <th className="px-5 py-3 text-right font-medium">Bids</th>
          <th className="px-5 py-3 text-right font-medium">Won</th>
          <th className="px-5 py-3 text-right font-medium">Lost</th>
          <th className="px-5 py-3 text-right font-medium">Open</th>
          <th className="px-5 py-3 font-medium">Win rate</th>
          <th className="px-5 py-3 text-right font-medium">Value won</th>
        </>
      }
    >
      {rows.map((row) => {
        const tone = winRateTone(row.winRatePercent);
        return (
        <tr key={row.segment} className="transition hover:bg-surface-muted">
          <td className="px-5 py-3 font-medium">
            {row.segment}
            {row.isPublicSector !== undefined && (
              <span className="ml-2 text-xs font-normal text-muted">
                {row.isPublicSector ? "public" : "private"}
              </span>
            )}
          </td>
          <td className="tabular px-5 py-3 text-right">{row.bids}</td>
          <td className="tabular px-5 py-3 text-right text-success">{row.won}</td>
          <td className="tabular px-5 py-3 text-right text-danger">{row.lost}</td>
          <td className="tabular px-5 py-3 text-right text-muted">{row.open}</td>
          <td className="px-5 py-3">
            {row.winRatePercent === null ? (
              <span className="text-xs text-muted">Undecided</span>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-20">
                  <Meter
                    value={row.winRatePercent}
                    tone={tone === "neutral" ? "accent" : tone}
                  />
                </div>
                <span className="tabular text-xs font-medium">
                  {row.winRatePercent}%
                </span>
              </div>
            )}
          </td>
          <td className="tabular px-5 py-3 text-right">
            {formatCentsCompact(row.wonValueCents)}
          </td>
        </tr>
        );
      })}
    </DataTable>
  );
}

export default async function ReportsPage() {
  const data = await withSession(async () => ({
    funnel: await bidFunnel(),
    byIndustry: await winLossByIndustry(),
    byClient: await winLossByClient(),
    byValueBand: await winLossByValueBand(),
    trend: await monthlyBidTrend(),
    winRate: await tenderWinRate(),
  }));

  const { funnel, byIndustry, byClient, byValueBand, trend, winRate } = data;
  const discovered = funnel[0];
  const submitted = funnel[2];
  const won = funnel[3];
  const maxTrend = Math.max(
    1,
    ...trend.map((month) => Math.max(month.submitted, month.won + month.lost)),
  );

  const bestBand = [...byValueBand]
    .filter((band) => band.won + band.lost >= 1)
    .sort((a, b) => (b.winRatePercent ?? 0) - (a.winRatePercent ?? 0))[0];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Bid book performance — what converts, where we win, and what it is worth"
        action={<Badge tone="accent">Live data</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Win rate"
          value={winRate.ratePercent === null ? "—" : `${winRate.ratePercent}%`}
          hint={`${winRate.won} won · ${winRate.lost} lost`}
          tone="success"
        />
        <StatTile
          label="Bid rate"
          value={
            discovered && discovered.count > 0
              ? `${Math.round(((submitted?.count ?? 0) / discovered.count) * 100)}%`
              : "—"
          }
          hint="Submitted ÷ discovered"
        />
        <StatTile
          label="Value won"
          value={formatCentsCompact(won?.valueCents ?? 0n)}
          hint={`${won?.count ?? 0} awarded bids`}
        />
        <StatTile
          label="Best value band"
          value={bestBand?.segment ?? "—"}
          hint={
            bestBand
              ? `${bestBand.winRatePercent}% win rate over ${bestBand.won + bestBand.lost} decided`
              : "Not enough decided bids"
          }
          tone="success"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Bid funnel"
            description="Cumulative — a won bid was also discovered, qualified and submitted"
          />
          <div className="space-y-4 px-5 py-5">
            {funnel.map((stage) => {
              const width =
                discovered && discovered.count > 0
                  ? (stage.count / discovered.count) * 100
                  : 0;
              return (
                <div key={stage.key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-muted">
                      <span className="tabular font-medium text-foreground">
                        {stage.count}
                      </span>
                      {stage.conversionPercent !== null && (
                        <span className="tabular ml-2">
                          {stage.conversionPercent}% of previous
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex h-7 items-center overflow-hidden rounded bg-surface-muted">
                    <div
                      className="flex h-full items-center justify-end rounded bg-accent px-2"
                      style={{ width: `${Math.max(width, 6)}%` }}
                    >
                      <span className="tabular text-[11px] font-semibold text-accent-foreground">
                        {formatCentsCompact(stage.valueCents)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            Qualification rate, bid rate and win rate read straight off this. The
            stage that matters most is the one with the steepest drop — it is
            where effort is being spent without return.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Twelve months"
            description="Submissions against outcomes, by month"
          />
          <div className="px-5 py-5">
            {/*
              Two bars per month rather than one stacked bar. A tender that was
              won was also submitted, so stacking the three counts the same bid
              twice and overstates every busy month.
            */}
            <div className="flex h-40 items-end gap-2">
              {trend.map((month) => (
                <div
                  key={month.month}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div className="flex h-32 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-2 rounded-t bg-surface-muted"
                      style={{
                        height: `${(month.submitted / maxTrend) * 100}%`,
                        minHeight: month.submitted > 0 ? "2px" : "0",
                      }}
                      title={`${month.submitted} submitted`}
                    />
                    <div className="flex w-2 flex-col justify-end">
                      <div
                        className="w-full rounded-t bg-success"
                        style={{
                          height: `${(month.won / maxTrend) * 128}px`,
                          minHeight: month.won > 0 ? "2px" : "0",
                        }}
                        title={`${month.won} won`}
                      />
                      <div
                        className="w-full bg-danger/60"
                        style={{
                          height: `${(month.lost / maxTrend) * 128}px`,
                          minHeight: month.lost > 0 ? "2px" : "0",
                        }}
                        title={`${month.lost} lost`}
                      />
                    </div>
                  </div>
                  <span className="text-[9px] text-muted">
                    {month.month.split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-surface-muted" /> Submitted
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-success" /> Won
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-danger/60" /> Lost
              </span>
              <span className="tabular ml-auto">Scale: {maxTrend} per month</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Win rate by contract size"
          description="Usually the most actionable cut — most contractors have a band they win in"
        />
        <SegmentTable rows={byValueBand} header="Value band" />
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Win rate by sector"
          description="Where the effort has actually paid"
        />
        <SegmentTable rows={byIndustry} header="Sector" />
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Win rate by buyer"
          description="Which clients award us work, and which keep taking our time"
        />
        <SegmentTable rows={byClient} header="Buyer" />
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Record-level reports"
          description="Every tender and every opportunity carries its own report"
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Link
            href="/tenders"
            className="rounded-lg border border-border px-4 py-3 transition hover:bg-surface-muted"
          >
            <p className="text-sm font-medium">Tender report</p>
            <p className="mt-1 text-xs text-muted">
              Lifecycle position, submission readiness, approvals, connected
              records, and our track record with that buyer and in that sector.
              Open any tender and choose &ldquo;Report&rdquo;.
            </p>
          </Link>
          <Link
            href="/crm/pipeline"
            className="rounded-lg border border-border px-4 py-3 transition hover:bg-surface-muted"
          >
            <p className="text-sm font-medium">Opportunity report</p>
            <p className="mt-1 text-xs text-muted">
              Stage progression, weighted value, engagement, deals that have gone
              quiet, and how deals with that client have gone before. Open any
              opportunity and choose &ldquo;Report&rdquo;.
            </p>
          </Link>
        </div>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ComingSoon title="Competitor intelligence" dependsOn="Evaluation tracking">
          Winning bidder, winning price and our gap to it. Previewed on the
          intelligence screen — the data has nowhere to be recorded until
          evaluation tracking is built.
        </ComingSoon>
        <ComingSoon title="Margin reporting" dependsOn="Pricing / Finance">
          Won value is revenue, not profit. Margin by sector, by buyer and by
          contract size is the same report with the number that matters.
        </ComingSoon>
        <ComingSoon title="Scheduled & exported reports" dependsOn="Reporting module">
          PDF and Excel export, and a Monday morning summary to the executive
          without anybody opening the system.
        </ComingSoon>
      </div>
    </>
  );
}
