import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  StatTile,
} from "@/components/ui";
import {
  ComingSoon,
  DataTable,
  Meter,
  PreviewBanner,
  PreviewNav,
} from "@/components/ui/preview";
import { PREVIEW_NAV } from "@/lib/preview/nav";
import {
  DISCOVERED,
  DISCOVERY_SOURCES,
  OPPORTUNITY_TYPES,
} from "@/lib/preview/demo-data";
import { formatCents, formatDate, formatRelativeDays } from "@/lib/format";

/**
 * Sections 3 to 6 — finding the work.
 *
 * The register we have starts at "someone typed a tender in". This is the
 * layer before it: every source in one inbox, each opportunity typed and
 * classified, and a fit score so a bid manager reads six opportunities a day
 * instead of four hundred.
 *
 * The scoring is the part worth arguing about, so it is shown with its
 * reasoning and its blockers rather than as a bare percentage.
 */

export default function DiscoveryPage() {
  const totalNew = DISCOVERY_SOURCES.reduce((n, s) => n + s.newThisWeek, 0);
  const totalMatched = DISCOVERY_SOURCES.reduce((n, s) => n + s.matched, 0);
  const worthBidding = DISCOVERED.filter((o) => o.match >= 70 && !o.blocker);

  return (
    <>
      <PageHeader
        title="Tender discovery"
        description="One inbox for every source, filtered against what this company can actually win"
      />

      <PreviewNav items={PREVIEW_NAV} current="/preview/discovery" />

      <PreviewBanner>
        Capture, typing and classification are the design under review.
        Automatic collection from the portals below needs connectors that have
        not been built — until then opportunities are captured by hand, which
        the tender register already supports.
      </PreviewBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Published this week"
          value={String(totalNew)}
          hint="Across all sources"
        />
        <StatTile
          label="Matched to us"
          value={String(totalMatched)}
          hint="Service line, region and grading"
          tone="success"
        />
        <StatTile
          label="Worth bidding"
          value={String(worthBidding.length)}
          hint="70%+ fit, no blocker"
          tone="success"
        />
        <StatTile
          label="Closing in 7 days"
          value={String(
            DISCOVERED.filter(
              (o) => formatRelativeDays(o.closingAt).days <= 7,
            ).length,
          )}
          hint="Decide now or lose the chance"
          tone="warning"
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Matched opportunities"
          description="Section 47 — scored against services, experience, grading, geography and win history"
        />
        <ul className="divide-y divide-border">
          {DISCOVERED.map((opportunity) => {
            const closing = formatRelativeDays(opportunity.closingAt);
            const tone =
              opportunity.blocker || opportunity.match < 50
                ? "danger"
                : opportunity.match >= 80
                  ? "success"
                  : "warning";

            return (
              <li key={opportunity.reference} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{opportunity.type}</Badge>
                      <span className="tabular text-xs text-muted">
                        {opportunity.reference}
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm font-medium">
                      {opportunity.title}
                    </h3>
                    <p className="text-xs text-muted">
                      {opportunity.buyer} · {opportunity.province}
                    </p>
                    <p className="mt-1.5 text-xs text-muted">
                      {opportunity.reason}
                    </p>
                    {opportunity.blocker && (
                      <p className="mt-1.5 inline-flex rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">
                        {opportunity.blocker}
                      </p>
                    )}
                  </div>

                  <div className="w-44 shrink-0">
                    <Meter
                      value={opportunity.match}
                      tone={tone}
                      label="Fit"
                      caption={`${opportunity.match}%`}
                    />
                    <dl className="mt-3 space-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Value</dt>
                        <dd className="tabular font-medium">
                          {opportunity.valueCents === 0n
                            ? "Not priced"
                            : formatCents(opportunity.valueCents)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Closes</dt>
                        <dd
                          className={`tabular font-medium ${
                            closing.days <= 7 ? "text-danger" : ""
                          }`}
                        >
                          {formatDate(opportunity.closingAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Sources"
            description="Where opportunities come from, and how they arrive"
          />
          <DataTable
            head={
              <>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 text-right font-medium">New</th>
                <th className="px-5 py-3 text-right font-medium">Matched</th>
                <th className="px-5 py-3 font-medium">Collection</th>
              </>
            }
          >
            {DISCOVERY_SOURCES.map((source) => (
              <tr key={source.name} className="transition hover:bg-surface-muted">
                <td className="px-5 py-3 font-medium">{source.name}</td>
                <td className="px-5 py-3 text-muted">{source.category}</td>
                <td className="tabular px-5 py-3 text-right text-muted">
                  {source.newThisWeek}
                </td>
                <td className="tabular px-5 py-3 text-right font-medium">
                  {source.matched}
                </td>
                <td className="px-5 py-3">
                  <Badge
                    tone={
                      source.state === "manual"
                        ? "success"
                        : source.state === "connected"
                          ? "accent"
                          : "neutral"
                    }
                  >
                    {source.state === "manual"
                      ? "By hand — live"
                      : source.state === "connected"
                        ? "Connected"
                        : "Connector to build"}
                  </Badge>
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>

        <Card>
          <CardHeader
            title="Opportunity types"
            description="Section 4 — a dozen words for the same thing, one record with a type"
          />
          <ul className="divide-y divide-border">
            {OPPORTUNITY_TYPES.map((type) => (
              <li key={type.code} className="flex items-baseline gap-3 px-5 py-2.5">
                <span className="tabular w-14 shrink-0 text-xs font-semibold text-accent">
                  {type.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{type.label}</span>
                  <span className="block text-xs text-muted">{type.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            Treating these as one entity with a type is a schema decision, not a
            cosmetic one. An RFQ and a panel appointment run the same lifecycle
            with different stages switched off — building them as separate
            systems is how tender software ends up with four registers nobody
            reconciles.
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ComingSoon title="Portal connectors" dependsOn="Integrations">
          Scheduled collection from eTenders, municipal and provincial portals
          and SOE databases, de-duplicated across sources. Each portal is its
          own piece of work; the capture and classification layer above does not
          change when they arrive.
        </ComingSoon>
        <ComingSoon title="Document scanning" dependsOn="AI layer">
          Section 44. Drop the tender PDF in, and closing date, buyer, reference,
          scope, mandatory documents, evaluation criteria and contract duration
          come back as a filled-in record and a checklist — instead of an
          afternoon with a highlighter.
        </ComingSoon>
      </div>
    </>
  );
}
