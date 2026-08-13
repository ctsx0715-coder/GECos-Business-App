import Link from "next/link";
import { notFound } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { db } from "@/lib/database/client";
import { NotFoundError } from "@/lib/errors";
import { tenderService } from "@/modules/tenders/tender.service";
import {
  clientTrackRecord,
  industryTrackRecord,
  tenderReportFacts,
  type TrackRecord,
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
import { ComingSoon, Meter, ScoreRing } from "@/components/ui/preview";
import {
  formatCents,
  formatCentsCompact,
  formatDate,
  formatRelativeDays,
  tenderStatusLabel,
} from "@/lib/format";
import { LIFECYCLE } from "@/lib/preview/lifecycle";

/**
 * The tender-level report.
 *
 * One bid, everything known about it: where it is in the lifecycle, whether it
 * can be submitted, how long it has been open, what it is linked to, and — the
 * part nobody has to hand when they need it — how this company has historically
 * fared with this buyer and in this sector.
 *
 * Every number on this page is real, computed from the tenant's own data
 * through the metrics layer. The three panels at the bottom are marked as
 * preview because the layers that would fill them (scoring, pricing, evaluation)
 * are designed but not yet built, and an invented number on a report is worse
 * than an empty one.
 */

/** Which lifecycle stages a tender has passed, from its status alone. */
function stagesReached(status: string): string[] {
  const base = ["discovery", "qualification", "bid-no-bid"];
  switch (status) {
    case "IDENTIFIED":
      return ["discovery"];
    case "IN_PROGRESS":
      return [...base, "compliance", "preparation"];
    case "PENDING_APPROVAL":
      return [...base, "compliance", "preparation", "pricing"];
    case "APPROVED":
      return [...base, "compliance", "preparation", "pricing", "technical"];
    case "SUBMITTED":
      return [...base, "compliance", "preparation", "pricing", "technical", "submission", "evaluation"];
    case "WON":
      return [...base, "compliance", "preparation", "pricing", "technical", "submission", "evaluation", "award", "mobilisation"];
    case "LOST":
      return [...base, "compliance", "preparation", "pricing", "technical", "submission", "evaluation", "award"];
    default:
      return base;
  }
}

function TrackRecordPanel({
  title,
  description,
  record,
}: {
  title: string;
  description: string;
  record: TrackRecord;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {record.bids === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted">
          No other bids on record.
        </p>
      ) : (
        <div className="px-5 py-4">
          <div className="flex items-baseline gap-2">
            <span className="tabular text-3xl font-semibold">
              {record.winRatePercent === null ? "—" : `${record.winRatePercent}%`}
            </span>
            <span className="text-xs text-muted">win rate</span>
          </div>
          <div className="mt-3">
            <Meter
              value={record.won}
              max={Math.max(1, record.won + record.lost)}
              tone={
                (record.winRatePercent ?? 0) >= 40
                  ? "success"
                  : (record.winRatePercent ?? 0) >= 20
                    ? "warning"
                    : "danger"
              }
            />
          </div>
          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted">Bids on record</dt>
              <dd className="tabular font-medium">{record.bids}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Won</dt>
              <dd className="tabular font-medium text-success">{record.won}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Lost</dt>
              <dd className="tabular font-medium text-danger">{record.lost}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Value awarded</dt>
              <dd className="tabular font-medium">
                {formatCentsCompact(record.awardedValueCents)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}

export default async function TenderReportPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const data = await withSession(async () => {
    try {
      const tender = await tenderService.getById(id);
      const facts = await tenderReportFacts(id);

      const client = tender.customerId
        ? await clientTrackRecord(tender.customerId, id)
        : null;
      const industry = tender.industry
        ? await industryTrackRecord(tender.industry, id)
        : null;

      const opportunities = await db.opportunity.findMany({
        where: { tenderId: id },
        select: {
          id: true,
          reference: true,
          title: true,
          stage: true,
          valueCents: true,
          probability: true,
        },
      });
      const projects = await db.project.findMany({
        where: { tenderId: id },
        select: {
          id: true,
          reference: true,
          name: true,
          status: true,
          contractValueCents: true,
          percentComplete: true,
        },
      });

      return { tender, facts, client, industry, opportunities, projects };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

  if (!data) notFound();
  const { tender, facts, client, industry, opportunities, projects } = data;

  const closing = formatRelativeDays(tender.closingAt);
  const reached = new Set(stagesReached(tender.status));
  const readiness =
    facts.requirementsTotal === 0
      ? 0
      : Math.round((facts.requirementsSatisfied / facts.requirementsTotal) * 100);
  const mandatoryOutstanding = facts.mandatoryTotal - facts.mandatorySatisfied;

  const value = tender.awardedValueCents ?? tender.estimatedValueCents;

  return (
    <>
      <div className="mb-4">
        <Link
          href={`/tenders/${tender.id}`}
          className="text-xs text-muted hover:underline"
        >
          ← {tender.reference}
        </Link>
      </div>

      <PageHeader
        title="Tender report"
        description={`${tender.reference} · ${tender.title}`}
        action={
          <Badge tone={statusTone(tender.status)}>
            {tenderStatusLabel(tender.status)}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={tender.status === "WON" ? "Awarded value" : "Value at stake"}
          value={formatCentsCompact(value)}
          hint={
            tender.awardedValueCents && tender.estimatedValueCents
              ? `Estimated ${formatCentsCompact(tender.estimatedValueCents)}`
              : "Estimated at capture"
          }
        />
        <StatTile
          label="Submission readiness"
          value={`${readiness}%`}
          hint={`${facts.requirementsSatisfied} of ${facts.requirementsTotal} requirements`}
          tone={
            mandatoryOutstanding > 0
              ? "warning"
              : readiness === 100
                ? "success"
                : "default"
          }
        />
        <StatTile
          label="Bid window"
          value={`${facts.daysOpen} days`}
          hint={
            tender.outcomeAt
              ? `Decided ${formatDate(tender.outcomeAt)}`
              : facts.daysToClosing !== null && facts.daysToClosing >= 0
                ? `${facts.daysToClosing} days to closing`
                : "Past its closing date"
          }
          tone={
            !tender.outcomeAt &&
            facts.daysToClosing !== null &&
            facts.daysToClosing < 0
              ? "danger"
              : "default"
          }
        />
        <StatTile
          label="Audit events"
          value={String(facts.auditEvents)}
          hint="Recorded changes on this bid"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Lifecycle position"
            description="Derived from the tender's status — every stage the bid has passed through"
          />
          <ol className="divide-y divide-border">
            {LIFECYCLE.filter((stage) =>
              [
                "discovery",
                "qualification",
                "bid-no-bid",
                "compliance",
                "preparation",
                "pricing",
                "technical",
                "submission",
                "evaluation",
                "award",
                "mobilisation",
                "delivery",
              ].includes(stage.key),
            ).map((stage) => {
              const done = reached.has(stage.key);
              return (
                <li
                  key={stage.key}
                  className="flex items-center gap-3 px-5 py-2.5"
                >
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      done
                        ? "bg-success-soft text-success"
                        : "bg-surface-muted text-muted"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span
                    className={`flex-1 text-sm ${done ? "font-medium" : "text-muted"}`}
                  >
                    {stage.name}
                  </span>
                  {stage.state !== "live" && (
                    <span className="text-[11px] text-muted">
                      {stage.state === "partial" ? "partly built" : "preview"}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>

        <Card>
          <CardHeader
            title="Submission readiness"
            description="Mandatory requirements gate the submit action"
          />
          <div className="flex flex-col items-center px-5 py-5">
            <ScoreRing
              value={readiness}
              suffix="%"
              caption="complete"
              tone={
                mandatoryOutstanding > 0
                  ? "warning"
                  : readiness === 100
                    ? "success"
                    : "accent"
              }
            />
            <p className="mt-2 text-center text-xs text-muted">
              {mandatoryOutstanding > 0
                ? `${mandatoryOutstanding} mandatory requirement${
                    mandatoryOutstanding === 1 ? "" : "s"
                  } outstanding`
                : "All mandatory requirements satisfied"}
            </p>
          </div>
          <dl className="divide-y divide-border border-t border-border text-xs">
            <div className="flex justify-between px-5 py-2">
              <dt className="text-muted">Mandatory</dt>
              <dd className="tabular font-medium">
                {facts.mandatorySatisfied} / {facts.mandatoryTotal}
              </dd>
            </div>
            <div className="flex justify-between px-5 py-2">
              <dt className="text-muted">All requirements</dt>
              <dd className="tabular font-medium">
                {facts.requirementsSatisfied} / {facts.requirementsTotal}
              </dd>
            </div>
            <div className="flex justify-between px-5 py-2">
              <dt className="text-muted">Approvals decided</dt>
              <dd className="tabular font-medium">
                {facts.approvalsDecided} / {facts.approvalsTotal}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="The bid" />
          <dl className="grid gap-4 px-5 py-4">
            <Field label="Buyer">{tender.customer?.name ?? "—"}</Field>
            <Field label="Sector">{tender.industry ?? "Unclassified"}</Field>
            <Field label="Owner">
              {tender.owner
                ? `${tender.owner.firstName} ${tender.owner.lastName}`
                : "Unassigned"}
            </Field>
            <Field label="Closing">
              {formatDate(tender.closingAt)}
              <span className="ml-2 text-xs text-muted">{closing.label}</span>
            </Field>
            <Field label="Submitted">
              {tender.submittedAt ? formatDate(tender.submittedAt) : "Not yet"}
            </Field>
            <Field label="Outcome">
              {tender.outcomeAt
                ? `${tenderStatusLabel(tender.status)} · ${formatDate(tender.outcomeAt)}`
                : "Undecided"}
            </Field>
            {tender.outcomeNotes && (
              <Field label="Outcome notes">{tender.outcomeNotes}</Field>
            )}
          </dl>
        </Card>

        {client ? (
          <TrackRecordPanel
            title="Track record with this buyer"
            description={`Our history with ${tender.customer?.name ?? "this client"}, excluding this bid`}
            record={client}
          />
        ) : (
          <Card>
            <CardHeader title="Track record with this buyer" />
            <p className="px-5 py-6 text-center text-sm text-muted">
              No buyer linked to this tender.
            </p>
          </Card>
        )}

        {industry ? (
          <TrackRecordPanel
            title="Track record in this sector"
            description={`All bids classified as ${tender.industry}, excluding this one`}
            record={industry}
          />
        ) : (
          <Card>
            <CardHeader title="Track record in this sector" />
            <p className="px-5 py-6 text-center text-sm text-muted">
              This tender has no sector classification, so it cannot be compared.
            </p>
          </Card>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Connected records"
          description="The thread from opportunity through bid to delivery"
        />
        {opportunities.length === 0 && projects.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">
            Nothing linked to this tender yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {opportunities.map((opportunity) => (
              <li key={opportunity.id}>
                <Link
                  href={`/crm/opportunities/${opportunity.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-muted"
                >
                  <Badge tone="accent">Opportunity</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {opportunity.title}
                    </span>
                    <span className="block text-xs text-muted">
                      {opportunity.reference} · {opportunity.stage.toLowerCase()} ·{" "}
                      {opportunity.probability}% probability
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm">
                    {formatCents(opportunity.valueCents)}
                  </span>
                </Link>
              </li>
            ))}
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-muted"
                >
                  <Badge tone="success">Project</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {project.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {project.reference} · {project.status.toLowerCase()} ·{" "}
                      {project.percentComplete}% complete
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
        {tender.status === "WON" && projects.length === 0 && (
          <p className="border-t border-border bg-warning-soft px-5 py-3 text-xs text-warning">
            This bid was won but has not been turned into a project. The handoff
            is on the tender page.
          </p>
        )}
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ComingSoon title="Bid / no-bid score" dependsOn="Qualification module">
          The weighted decision score, who took it and why. Previewed on the{" "}
          qualification screen — until it is stored, a report cannot show why
          this bid was pursued.
        </ComingSoon>
        <ComingSoon title="Price & margin" dependsOn="Pricing module">
          Submitted price against cost, margin, and the approved revision. The
          tender carries an estimated and an awarded value today; the build-up
          behind them has nowhere to live yet.
        </ComingSoon>
        <ComingSoon title="Evaluation & competitors" dependsOn="Evaluation tracking">
          Points scored on functionality, price and preference, the winning
          bidder and the winning price. The single most valuable thing to record
          about a lost bid, and the one most often lost.
        </ComingSoon>
      </div>
    </>
  );
}
