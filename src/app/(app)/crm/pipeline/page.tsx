import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import { crmService } from "@/modules/crm/crm.service";
import { crmSummary, pipelineByStage } from "@/lib/analytics/metrics";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import {
  formatCents,
  formatCentsCompact,
  formatDate,
  formatRelativeDays,
} from "@/lib/format";

/**
 * The pipeline board.
 *
 * Columns are the open stages only — closed deals belong in reporting, not in
 * a board people are meant to work from. Every figure comes from the metrics
 * layer rather than being summed in the component (ADR-005).
 */

const STAGES = [
  { key: "QUALIFIED", label: "Qualified" },
  { key: "PROPOSAL", label: "Proposal" },
  { key: "NEGOTIATION", label: "Negotiation" },
] as const;

export default async function PipelinePage() {
  const { opportunities, summary, stages, canCreate } = await withSession(async (session) => ({
    canCreate: session.permissions.has("crm.opportunity.create"),
    opportunities: await crmService.listOpportunities([
      "QUALIFIED",
      "PROPOSAL",
      "NEGOTIATION",
    ]),
    summary: await crmSummary(),
    stages: await pipelineByStage(),
  }));

  const byStage = new Map(stages.map((s) => [s.stage, s]));

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Qualified deals being worked, weighted by probability"
        action={
          canCreate ? (
            <ButtonLink href="/crm/opportunities/new" variant="primary">
              New opportunity
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open pipeline"
          value={formatCentsCompact(summary.openValueCents)}
          hint={`${summary.openDeals} deals`}
        />
        <StatTile
          label="Weighted forecast"
          value={formatCentsCompact(summary.weightedValueCents)}
          hint="Value × probability"
          tone="success"
        />
        <StatTile
          label="Won this year"
          value={formatCentsCompact(summary.wonValueCentsThisYear)}
          hint={`${summary.wonThisYear} deals`}
        />
        <StatTile
          label="Win rate"
          value={
            summary.winRatePercent === null ? "—" : `${summary.winRatePercent}%`
          }
          hint="Closed deals this year"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {STAGES.map((stage) => {
          const deals = opportunities.filter((o) => o.stage === stage.key);
          const totals = byStage.get(stage.key);

          return (
            <div key={stage.key} className="flex flex-col">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">{stage.label}</h2>
                <span className="tabular text-xs text-muted">
                  {deals.length} ·{" "}
                  {formatCentsCompact(totals?.valueCents ?? 0n)}
                </span>
              </div>

              <div className="space-y-2">
                {deals.length === 0 && (
                  <Card className="px-4 py-6 text-center text-xs text-muted">
                    Nothing at this stage
                  </Card>
                )}

                {deals.map((deal) => {
                  const close = formatRelativeDays(deal.expectedCloseAt);
                  const overdue = close.days < 0;
                  return (
                    <Card key={deal.id} className="px-4 py-3">
                      <Link
                        href={`/crm/opportunities/${deal.id}`}
                        className="block text-sm font-medium hover:underline"
                      >
                        {deal.title}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {deal.customer.name}
                      </p>

                      <div className="mt-2 flex items-center justify-between">
                        <span className="tabular text-sm font-semibold">
                          {formatCents(deal.valueCents)}
                        </span>
                        <Badge
                          tone={deal.probability >= 70 ? "success" : "neutral"}
                        >
                          {deal.probability}%
                        </Badge>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs text-muted">
                        <span className={overdue ? "text-danger" : undefined}>
                          {deal.expectedCloseAt
                            ? `${formatDate(deal.expectedCloseAt)} · ${close.label}`
                            : "No close date"}
                        </span>
                        {deal.tender && (
                          <Link
                            href={`/tenders/${deal.tender.id}`}
                            className="tabular shrink-0 text-accent hover:underline"
                          >
                            {deal.tender.reference}
                          </Link>
                        )}
                      </div>

                      {deal.owner && (
                        <p className="mt-1 text-xs text-muted">
                          {deal.owner.firstName} {deal.owner.lastName}
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {opportunities.length === 0 && (
        <Card className="mt-4">
          <EmptyState
            title="No open opportunities"
            description="Qualify a lead and convert it, and the deal will appear here."
          />
        </Card>
      )}
    </>
  );
}
