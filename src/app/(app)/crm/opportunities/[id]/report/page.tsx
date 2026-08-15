import Link from "next/link";
import { notFound } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { db } from "@/lib/database/client";
import { NotFoundError } from "@/lib/errors";
import { crmService } from "@/modules/crm/crm.service";
import {
  customerDealHistory,
  opportunityReportFacts,
} from "@/lib/analytics/reporting";
import {
  Badge,
  Card,
  CardHeader,
  Field,
  PageHeader,
  StatTile,
  statusTone,
} from "@/components/ui";
import { ComingSoon, Meter } from "@/components/ui/preview";
import {
  formatCents,
  formatCentsCompact,
  formatDate,
  formatRelativeDays,
  tenderStatusLabel,
} from "@/lib/format";

/**
 * The opportunity-level report.
 *
 * A pipeline row tells you a deal exists. This tells you whether it is
 * actually moving: how long it has sat, when anybody last spoke to the client,
 * what the weighted value really is, whether it is being pursued through a
 * tender, and how deals with this customer have gone before.
 *
 * The "gone quiet" warning is the point of the screen. A forecast built on
 * deals nobody has touched in six weeks is not a forecast.
 */

const STAGE_TONES: Record<string, "neutral" | "accent" | "success" | "danger"> = {
  QUALIFIED: "neutral",
  PROPOSAL: "accent",
  NEGOTIATION: "accent",
  WON: "success",
  LOST: "danger",
};

const STAGE_ORDER = ["QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON"];

export default async function OpportunityReportPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const data = await withSession(async () => {
    try {
      const opportunity = await crmService.getOpportunity(id);
      const facts = await opportunityReportFacts(id);
      const history = await customerDealHistory(opportunity.customerId, id);
      const activity = await crmService.activitiesFor("OPPORTUNITY", id);
      const projects = await db.project.findMany({
        where: { opportunityId: id },
        select: {
          id: true,
          reference: true,
          name: true,
          status: true,
          contractValueCents: true,
        },
      });
      return { opportunity, facts, history, activity, projects };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

  if (!data) notFound();
  const { opportunity, facts, history, activity, projects } = data;

  const closed = opportunity.stage === "WON" || opportunity.stage === "LOST";
  const stageIndex = STAGE_ORDER.indexOf(opportunity.stage);
  const goneQuiet =
    !closed &&
    facts.daysSinceLastActivity !== null &&
    facts.daysSinceLastActivity > 21;
  const overdue =
    !closed &&
    facts.daysToExpectedClose !== null &&
    facts.daysToExpectedClose < 0;

  return (
    <>
      <div className="mb-4">
        <Link
          href={`/crm/opportunities/${opportunity.id}`}
          className="text-xs text-muted hover:underline"
        >
          ← {opportunity.reference}
        </Link>
      </div>

      <PageHeader
        title="Opportunity report"
        description={`${opportunity.reference} · ${opportunity.customer.name}`}
        action={
          <Badge tone={STAGE_TONES[opportunity.stage] ?? "neutral"}>
            {opportunity.stage.toLowerCase()}
          </Badge>
        }
      />

      {(goneQuiet || overdue) && (
        <div className="mb-6 space-y-2">
          {goneQuiet && (
            <p className="rounded-[14px] border border-border bg-surface-muted px-4 py-3 text-xs text-warning">
              <strong className="font-semibold">Gone quiet.</strong> Nothing has
              been logged against this deal in {facts.daysSinceLastActivity}{" "}
              days, and it is still counted in the weighted forecast at{" "}
              {formatCents(facts.weightedValueCents)}.
            </p>
          )}
          {overdue && (
            <p className="rounded-[14px] border border-border bg-surface-muted px-4 py-3 text-xs text-danger">
              <strong className="font-semibold">Past its close date.</strong>{" "}
              Expected to close {formatDate(opportunity.expectedCloseAt)} —{" "}
              {Math.abs(facts.daysToExpectedClose ?? 0)} days ago. Either the
              date is wrong or the deal is.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Deal value"
          value={formatCentsCompact(opportunity.valueCents)}
          hint={`${opportunity.probability}% probability`}
        />
        <StatTile
          label="Weighted"
          value={formatCentsCompact(facts.weightedValueCents)}
          hint="What the forecast counts"
          tone="success"
        />
        <StatTile
          label="Days in pipeline"
          value={String(facts.daysInPipeline)}
          hint={
            history.medianDaysToClose === null
              ? "No comparable closed deals"
              : `Median for this client: ${history.medianDaysToClose}`
          }
          tone={
            history.medianDaysToClose !== null &&
            facts.daysInPipeline > history.medianDaysToClose * 1.5
              ? "warning"
              : "default"
          }
        />
        <StatTile
          label="Last touched"
          value={
            facts.daysSinceLastActivity === null
              ? "Never"
              : `${facts.daysSinceLastActivity}d`
          }
          hint={`${facts.activities} activities logged`}
          tone={goneQuiet || facts.daysSinceLastActivity === null ? "warning" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Stage progression"
            description="Where the deal sits, and what it is being pursued through"
          />
          <div className="px-5 py-5">
            <div className="flex items-center gap-1">
              {STAGE_ORDER.map((stage, index) => {
                const reached =
                  opportunity.stage === "LOST"
                    ? false
                    : stageIndex >= index && stageIndex !== -1;
                return (
                  <div key={stage} className="flex-1">
                    <div
                      className={`h-2 rounded-full ${
                        opportunity.stage === "LOST"
                          ? "bg-danger-soft"
                          : reached
                            ? "bg-accent"
                            : "bg-surface-muted"
                      }`}
                    />
                    <p
                      className={`mt-1.5 text-[11px] ${
                        reached ? "font-medium" : "text-muted"
                      }`}
                    >
                      {stage.charAt(0) + stage.slice(1).toLowerCase()}
                    </p>
                  </div>
                );
              })}
            </div>
            {opportunity.stage === "LOST" && (
              <p className="mt-4 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-danger">
                Lost{opportunity.lostReason ? `: ${opportunity.lostReason}` : ""}
                {opportunity.closedAt && ` · ${formatDate(opportunity.closedAt)}`}
              </p>
            )}
          </div>

          {opportunity.tender && (
            <div className="border-t border-border">
              <Link
                href={`/tenders/${opportunity.tender.id}/report`}
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-muted"
              >
                <Badge tone={statusTone(opportunity.tender.status)}>
                  {tenderStatusLabel(opportunity.tender.status)}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    Pursued through {opportunity.tender.reference}
                  </span>
                  <span className="block text-xs text-muted">
                    {opportunity.tender.title} · closes{" "}
                    {formatDate(opportunity.tender.closingAt)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-accent">
                  Tender report →
                </span>
              </Link>
            </div>
          )}

          {projects.length > 0 && (
            <ul className="divide-y divide-border border-t border-border">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-muted"
                  >
                    <Badge tone="success">Project</Badge>
                    <span className="min-w-0 flex-1 text-sm">
                      {project.name}
                      <span className="block text-xs text-muted">
                        {project.reference} · {project.status.toLowerCase()}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm">
                      {formatCents(project.contractValueCents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="History with this client"
            description={`Other deals with ${opportunity.customer.name}`}
          />
          {history.won + history.lost + history.open === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">
              First deal with this client.
            </p>
          ) : (
            <div className="px-5 py-4">
              <div className="flex items-baseline gap-2">
                <span className="tabular text-3xl font-semibold">
                  {history.winRatePercent === null
                    ? "—"
                    : `${history.winRatePercent}%`}
                </span>
                <span className="text-xs text-muted">win rate</span>
              </div>
              <div className="mt-3">
                <Meter
                  value={history.won}
                  max={Math.max(1, history.won + history.lost)}
                  tone={(history.winRatePercent ?? 0) >= 40 ? "success" : "warning"}
                />
              </div>
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted">Won</dt>
                  <dd className="tabular font-medium text-success">
                    {history.won}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Lost</dt>
                  <dd className="tabular font-medium text-danger">
                    {history.lost}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Still open</dt>
                  <dd className="tabular font-medium">{history.open}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Value won</dt>
                  <dd className="tabular font-medium">
                    {formatCentsCompact(history.wonValueCents)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Deal" />
          <dl className="grid gap-4 px-5 py-4">
            <Field label="Owner">
              {opportunity.owner
                ? `${opportunity.owner.firstName} ${opportunity.owner.lastName}`
                : "Unassigned"}
            </Field>
            <Field label="Contact">
              {opportunity.contact
                ? `${opportunity.contact.firstName} ${opportunity.contact.lastName}`
                : "—"}
            </Field>
            <Field label="Source">
              {opportunity.source
                ? opportunity.source.toLowerCase().replace(/_/g, " ")
                : "—"}
            </Field>
            <Field label="Expected close">
              {formatDate(opportunity.expectedCloseAt)}
              {opportunity.expectedCloseAt && (
                <span className="ml-2 text-xs text-muted">
                  {formatRelativeDays(opportunity.expectedCloseAt).label}
                </span>
              )}
            </Field>
            <Field label="Created">{formatDate(opportunity.createdAt)}</Field>
            <Field label="Other open deals here">
              {facts.siblingOpenDeals}
            </Field>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Engagement"
            description="Every logged touch, oldest at the bottom"
            action={<Badge tone="neutral">{facts.activities} logged</Badge>}
          />
          {activity.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">
              Nothing logged against this deal. A deal with no recorded
              engagement should not be carrying a probability.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex items-baseline gap-3 px-5 py-2.5">
                  <Badge tone="neutral">
                    {entry.type.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                  <span className="min-w-0 flex-1 text-sm">{entry.subject}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {formatDate(entry.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ComingSoon title="Competitor & loss analysis" dependsOn="Tender intelligence">
          Who else was bidding, what they charged and why we lost. A lost-reason
          field is captured today; the competitor and the winning price are not,
          and they are what makes the next bid better.
        </ComingSoon>
        <ComingSoon title="Margin at deal level" dependsOn="Pricing / Finance">
          Expected margin rather than expected revenue. A weighted pipeline of
          revenue tells you how busy you will be; a weighted pipeline of margin
          tells you whether it is worth it.
        </ComingSoon>
      </div>
    </>
  );
}
