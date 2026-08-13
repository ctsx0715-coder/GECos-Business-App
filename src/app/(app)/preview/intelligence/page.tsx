import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import {
  winLossByClient,
  winLossByIndustry,
} from "@/lib/analytics/reporting";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  ComingSoon,
  DataTable,
  Meter,
  PreviewBanner,
  PreviewNav,
} from "@/components/ui/preview";
import { PREVIEW_NAV } from "@/lib/preview/nav";
import { COMPETITORS } from "@/lib/preview/demo-data";
import { formatCentsCompact } from "@/lib/format";

/**
 * Sections 36 and 37 — tender intelligence.
 *
 * Two halves, deliberately shown together. The top half is real: win rate by
 * sector and by buyer, computed from this tenant's own bid history through the
 * metrics layer. The bottom half is a preview, because who else bid and what
 * they charged is not recorded anywhere yet.
 *
 * The contrast is the argument for building evaluation tracking. Our own
 * outcomes tell us where we win; only the competitor data tells us why.
 */

export default async function IntelligencePage() {
  const data = await withSession(async () => ({
    byIndustry: await winLossByIndustry(),
    byClient: await winLossByClient(),
  }));

  const { byIndustry, byClient } = data;
  const decidedClients = byClient.filter((c) => c.won + c.lost > 0);
  const bestClient = [...decidedClients].sort(
    (a, b) => (b.winRatePercent ?? 0) - (a.winRatePercent ?? 0),
  )[0];
  const worstClient = [...decidedClients]
    .filter((c) => c.won + c.lost >= 2)
    .sort((a, b) => (a.winRatePercent ?? 0) - (b.winRatePercent ?? 0))[0];

  return (
    <>
      <PageHeader
        title="Tender intelligence"
        description="What our own history already tells us, and what we are not yet recording"
      />

      <PreviewNav items={PREVIEW_NAV} current="/preview/intelligence" />

      <PreviewBanner>
        The two panels below this line are live, from your own tenders. Anything
        further down is a preview — competitor names, winning prices and
        evaluation scores have nowhere to be recorded until evaluation tracking
        is built, and inventing them on a real screen would be worse than
        leaving the gap visible.
      </PreviewBanner>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Where we win — by sector"
            description="Live · computed from recorded outcomes"
            action={<Badge tone="success">Live</Badge>}
          />
          {byIndustry.length === 0 ? (
            <EmptyState
              title="No classified tenders"
              description="Tenders need a sector and a recorded outcome before this means anything."
            />
          ) : (
            <ul className="divide-y divide-border">
              {byIndustry.map((row) => (
                <li key={row.segment} className="px-5 py-3">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{row.segment}</span>
                    <span className="text-xs text-muted">
                      <span className="tabular font-medium text-foreground">
                        {row.winRatePercent === null
                          ? "—"
                          : `${row.winRatePercent}%`}
                      </span>{" "}
                      over {row.won + row.lost} decided
                    </span>
                  </div>
                  <Meter
                    value={row.winRatePercent ?? 0}
                    tone={
                      (row.winRatePercent ?? 0) >= 40
                        ? "success"
                        : (row.winRatePercent ?? 0) >= 20
                          ? "warning"
                          : "danger"
                    }
                  />
                  <p className="mt-1 text-xs text-muted">
                    {row.bids} bids · {formatCentsCompact(row.wonValueCents)} won
                    · {row.open} still open
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Which buyers award us work"
            description="Live · every buyer we have bid to"
            action={<Badge tone="success">Live</Badge>}
          />
          {byClient.length === 0 ? (
            <EmptyState
              title="No buyers on record"
              description="Link tenders to customers and this fills itself in."
            />
          ) : (
            <>
              <DataTable
                head={
                  <>
                    <th className="px-5 py-3 font-medium">Buyer</th>
                    <th className="px-5 py-3 text-right font-medium">Bids</th>
                    <th className="px-5 py-3 text-right font-medium">Won</th>
                    <th className="px-5 py-3 text-right font-medium">Rate</th>
                    <th className="px-5 py-3 text-right font-medium">Value</th>
                  </>
                }
              >
                {byClient.map((row) => (
                  <tr key={row.segment} className="transition hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <span className="block font-medium">{row.segment}</span>
                      <span className="block text-xs text-muted">
                        {row.isPublicSector ? "Public sector" : "Private sector"}
                      </span>
                    </td>
                    <td className="tabular px-5 py-3 text-right">{row.bids}</td>
                    <td className="tabular px-5 py-3 text-right text-success">
                      {row.won}
                    </td>
                    <td className="tabular px-5 py-3 text-right font-medium">
                      {row.winRatePercent === null ? "—" : `${row.winRatePercent}%`}
                    </td>
                    <td className="tabular px-5 py-3 text-right">
                      {formatCentsCompact(row.wonValueCents)}
                    </td>
                  </tr>
                ))}
              </DataTable>
              {(bestClient || worstClient) && (
                <div className="space-y-1 border-t border-border px-5 py-3 text-xs text-muted">
                  {bestClient && (
                    <p>
                      Strongest relationship:{" "}
                      <strong className="font-medium text-foreground">
                        {bestClient.segment}
                      </strong>{" "}
                      at {bestClient.winRatePercent}% over{" "}
                      {bestClient.won + bestClient.lost} decided bids.
                    </p>
                  )}
                  {worstClient &&
                    worstClient.segment !== bestClient?.segment && (
                      <p>
                        Worth questioning:{" "}
                        <strong className="font-medium text-foreground">
                          {worstClient.segment}
                        </strong>{" "}
                        at {worstClient.winRatePercent}% over{" "}
                        {worstClient.won + worstClient.lost} decided bids.
                      </p>
                    )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <p className="mt-8 mb-4 text-xs font-semibold uppercase tracking-widest text-warning">
        Preview from here — nothing below is recorded yet
      </p>

      <Card>
        <CardHeader
          title="Competitors"
          description="Section 36 — who we keep meeting, and how our price compares"
          action={<Badge tone="warning">Preview</Badge>}
        />
        <DataTable
          head={
            <>
              <th className="px-5 py-3 font-medium">Competitor</th>
              <th className="px-5 py-3 text-right font-medium">Met</th>
              <th className="px-5 py-3 text-right font-medium">Beat us</th>
              <th className="px-5 py-3 text-right font-medium">We beat</th>
              <th className="px-5 py-3 text-right font-medium">Price gap</th>
              <th className="px-5 py-3 font-medium">Pattern</th>
            </>
          }
        >
          {COMPETITORS.map((competitor) => (
            <tr key={competitor.name} className="transition hover:bg-surface-muted">
              <td className="px-5 py-3 font-medium">{competitor.name}</td>
              <td className="tabular px-5 py-3 text-right">
                {competitor.metThisYear}
              </td>
              <td className="tabular px-5 py-3 text-right text-danger">
                {competitor.wonAgainstUs}
              </td>
              <td className="tabular px-5 py-3 text-right text-success">
                {competitor.lostToUs}
              </td>
              <td
                className={`tabular px-5 py-3 text-right font-medium ${
                  competitor.averagePriceDelta < 0 ? "text-danger" : "text-success"
                }`}
              >
                {competitor.averagePriceDelta > 0 ? "+" : ""}
                {competitor.averagePriceDelta.toFixed(1)}%
              </td>
              <td className="max-w-xs px-5 py-3 text-xs text-muted">
                {competitor.note}
              </td>
            </tr>
          ))}
        </DataTable>
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          Price gap is our bid against theirs where the award was published. A
          competitor consistently 6% below us on supply is not a pricing problem
          to solve on the next bid — it is a procurement question about what we
          pay for luminaires.
        </p>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Questions this layer answers"
          description="Section 36 — the reason to record outcomes properly rather than as an afterthought"
        />
        <ul className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          {[
            {
              q: "Which tenders are we most likely to win?",
              a: "Live — win rate by sector, buyer and value band",
              live: true,
            },
            {
              q: "Which clients award the most contracts?",
              a: "Live — bids and awarded value per buyer",
              live: true,
            },
            {
              q: "What is our bid-to-win ratio?",
              a: "Live — the bid funnel on the reports page",
              live: true,
            },
            {
              q: "Which sectors have the highest win rate?",
              a: "Live — sector performance above",
              live: true,
            },
            {
              q: "What price range wins?",
              a: "Needs winning prices captured at award",
              live: false,
            },
            {
              q: "Which competitors keep winning?",
              a: "Needs competitor capture at evaluation",
              live: false,
            },
          ].map((item) => (
            <li
              key={item.q}
              className="rounded-lg border border-border px-4 py-3"
            >
              <p className="text-sm font-medium">{item.q}</p>
              <p
                className={`mt-1 text-xs ${item.live ? "text-success" : "text-muted"}`}
              >
                {item.a}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ComingSoon title="Award notice ingestion" dependsOn="Integrations">
          Published award notices matched back to bids we submitted, filling in
          the winning bidder and winning price without anybody typing them.
        </ComingSoon>
        <ComingSoon title="Buyer spend history" dependsOn="Integrations">
          What a buyer has awarded historically, to whom and at what value — the
          market intelligence that decides where to look before a tender is
          advertised.
        </ComingSoon>
      </div>

      <p className="mt-6 text-xs text-muted">
        The live cuts on this page are also available on the{" "}
        <Link href="/reports" className="text-accent hover:underline">
          reports page
        </Link>
        , alongside the bid funnel and twelve-month trend.
      </p>
    </>
  );
}
