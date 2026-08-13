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
  BOQ,
  COST_BUILDUP,
  DEMO_TENDER,
  PRICING_APPROVALS,
  PRICING_ASSUMPTIONS,
  PRICING_REVISIONS,
  boqTotalCents,
  pricingBuildUp,
} from "@/lib/preview/demo-data";
import { formatCents, formatCentsCompact, formatDate } from "@/lib/format";

/**
 * Sections 19, 20 and 21 — the price.
 *
 * Three things that must hold together: a cost build-up, a bill of quantities
 * that reconciles to it, and an approval chain nobody can go around. Pricing is
 * where a tender business makes or loses its year, so the version history
 * matters as much as the number — "why is this R129 000 lower than last week?"
 * should have an answer on the screen.
 */

export default function PricingPage() {
  const build = pricingBuildUp();
  const boqTotal = boqTotalCents();
  const direct = Number(build.direct);
  const approved = PRICING_APPROVALS.filter((a) => a.status === "approved");

  return (
    <>
      <PageHeader
        title="Pricing"
        description={`${DEMO_TENDER.reference} · cost build-up, bill of quantities and approval`}
        action={<Badge tone="warning">Revision 3 · awaiting approval</Badge>}
      />

      <PreviewNav items={PREVIEW_NAV} current="/preview/pricing" />

      <PreviewBanner>
        Pricing has no module yet. This is the shape it would take, and the
        numbers are demonstration data — but the arithmetic is real, and money
        is held in integer cents here exactly as it is everywhere else in the
        system.
      </PreviewBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Tender price (excl. VAT)"
          value={formatCentsCompact(build.exVat)}
          hint={`${formatCentsCompact(build.inclVat)} including VAT`}
        />
        <StatTile
          label="Gross margin"
          value={`${build.grossMarginPercent.toFixed(1)}%`}
          hint={formatCentsCompact(build.margin)}
          tone="success"
        />
        <StatTile
          label="Direct cost"
          value={formatCentsCompact(build.direct)}
          hint={`+${PRICING_ASSUMPTIONS.overheadPercent}% overhead, +${PRICING_ASSUMPTIONS.contingencyPercent}% contingency`}
        />
        <StatTile
          label="Against estimate"
          value={`${(
            (Number(build.exVat) / Number(DEMO_TENDER.estimatedValueCents) - 1) *
            100
          ).toFixed(1)}%`}
          hint={`Buyer estimate ${formatCentsCompact(DEMO_TENDER.estimatedValueCents)}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Cost build-up"
            description="Section 19 — every input priced, nothing carried in someone's head"
          />
          <div className="divide-y divide-border">
            {COST_BUILDUP.map((line) => (
              <div key={line.category} className="flex items-center gap-4 px-5 py-3">
                <div className="w-52 shrink-0">
                  <p className="text-sm font-medium">{line.category}</p>
                  <p className="text-xs text-muted">{line.note}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <Meter value={Number(line.amountCents)} max={direct} />
                </div>
                <span className="tabular w-28 shrink-0 text-right text-sm">
                  {formatCents(line.amountCents)}
                </span>
              </div>
            ))}
          </div>
          <dl className="divide-y divide-border border-t border-border">
            {[
              { label: "Direct cost", value: build.direct },
              {
                label: `Overhead (${PRICING_ASSUMPTIONS.overheadPercent}%)`,
                value: build.overhead,
              },
              {
                label: `Contingency (${PRICING_ASSUMPTIONS.contingencyPercent}%)`,
                value: build.contingency,
              },
              { label: "Total cost", value: build.cost, strong: true },
              {
                label: `Margin (${PRICING_ASSUMPTIONS.marginPercent}%)`,
                value: build.margin,
              },
              { label: "Tender price excl. VAT", value: build.exVat, strong: true },
              { label: "VAT at 15%", value: build.vat },
              { label: "Tender price incl. VAT", value: build.inclVat, strong: true },
            ].map((row) => (
              <div
                key={row.label}
                className={`flex items-center justify-between px-5 py-2.5 text-sm ${
                  row.strong ? "font-semibold" : "text-muted"
                }`}
              >
                <dt>{row.label}</dt>
                <dd className="tabular">{formatCents(row.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            {PRICING_ASSUMPTIONS.escalationNote}. A fixed-rate first year against
            a 36-month contract is the single largest commercial risk on this
            bid, and it is priced in the contingency rather than hoped away.
          </p>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Approval chain"
              description="Section 21 — no price leaves without it"
              action={
                <Badge tone="warning">
                  {approved.length} of {PRICING_APPROVALS.length}
                </Badge>
              }
            />
            <ol className="divide-y divide-border">
              {PRICING_APPROVALS.map((approval, index) => (
                <li key={approval.step} className="flex items-start gap-3 px-5 py-3">
                  <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-muted">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{approval.step}</p>
                    <p className="text-xs text-muted">
                      {approval.person}
                      {approval.decidedAt && ` · ${formatDate(approval.decidedAt)}`}
                    </p>
                    {approval.note && (
                      <p className="mt-0.5 text-xs text-muted">{approval.note}</p>
                    )}
                  </div>
                  <Badge
                    tone={
                      approval.status === "approved"
                        ? "success"
                        : approval.status === "pending"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {approval.status === "waiting" ? "Not reached" : approval.status}
                  </Badge>
                </li>
              ))}
            </ol>
            <p className="border-t border-border px-5 py-3 text-xs text-muted">
              The approval engine driving the tender submission chain already
              works this way, including separation of duties. Pointing it at a
              pricing record is configuration, not new machinery.
            </p>
          </Card>

          <Card>
            <CardHeader
              title="Revisions"
              description="What changed, and why"
            />
            <ul className="divide-y divide-border">
              {PRICING_REVISIONS.map((revision, index) => {
                const previous = PRICING_REVISIONS[index + 1];
                const delta = previous
                  ? Number(revision.priceCents - previous.priceCents)
                  : 0;
                return (
                  <li key={revision.version} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">
                        Revision {revision.version}
                      </span>
                      <span className="tabular text-sm">
                        {formatCents(revision.priceCents)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs text-muted">
                        {formatDate(revision.at)}
                      </span>
                      {previous && (
                        <span
                          className={`tabular text-xs font-medium ${
                            delta < 0 ? "text-success" : "text-warning"
                          }`}
                        >
                          {delta < 0 ? "−" : "+"}
                          {formatCentsCompact(Math.abs(delta))}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">{revision.reason}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Bill of quantities"
          description="Section 20 — quantity × rate = amount, reconciled against the build-up"
          action={
            <span className="tabular text-sm font-semibold">
              {formatCents(boqTotal)}
            </span>
          }
        />
        <DataTable
          head={
            <>
              <th className="px-5 py-3 font-medium">Item</th>
              <th className="px-5 py-3 font-medium">Description</th>
              <th className="px-5 py-3 font-medium">Unit</th>
              <th className="px-5 py-3 text-right font-medium">Quantity</th>
              <th className="px-5 py-3 text-right font-medium">Rate</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
            </>
          }
        >
          {BOQ.map((line) => (
            <tr key={line.item} className="transition hover:bg-surface-muted">
              <td className="tabular px-5 py-3 font-medium">{line.item}</td>
              <td className="px-5 py-3">{line.description}</td>
              <td className="px-5 py-3 text-muted">{line.unit}</td>
              <td className="tabular px-5 py-3 text-right">
                {line.quantity.toLocaleString("en-ZA")}
              </td>
              <td className="tabular px-5 py-3 text-right text-muted">
                {formatCents(line.rateCents)}
              </td>
              <td className="tabular px-5 py-3 text-right font-medium">
                {formatCents(BigInt(line.quantity) * line.rateCents)}
              </td>
            </tr>
          ))}
        </DataTable>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border px-5 py-3 text-xs">
          <div className="flex gap-2">
            <dt className="text-muted">BOQ total</dt>
            <dd className="tabular font-medium">{formatCents(boqTotal)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Tender price excl. VAT</dt>
            <dd className="tabular font-medium">{formatCents(build.exVat)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Difference</dt>
            <dd
              className={`tabular font-medium ${
                boqTotal - build.exVat === 0n ? "text-success" : "text-warning"
              }`}
            >
              {boqTotal - build.exVat >= 0n ? "+" : "−"}
              {formatCents(
                boqTotal - build.exVat >= 0n
                  ? boqTotal - build.exVat
                  : build.exVat - boqTotal,
              )}{" "}
              <span className="font-normal text-muted">(rate rounding)</span>
            </dd>
          </div>
        </dl>
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          The priced BOQ is a returnable schedule: it goes to the buyer. The
          cost build-up above does not — it holds our supplier costs and our
          margin, and a system that stores both must know which of them may be
          exported.
        </p>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ComingSoon title="Rate library & supplier quotes" dependsOn="Procurement">
          Standing labour, plant and material rates with supplier quotes
          attached, so a BOQ is priced from current rates rather than from the
          last tender someone copied.
        </ComingSoon>
        <ComingSoon title="Cash flow & guarantees" dependsOn="Finance">
          Payment terms, retention, escalation and the performance guarantee
          modelled over the contract period. A 10% guarantee within 21 days of
          award is a funding decision, and it belongs next to the price.
        </ComingSoon>
      </div>
    </>
  );
}
