import Link from "next/link";
import { notFound } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { crmService } from "@/modules/crm/crm.service";
import { NotFoundError } from "@/lib/errors";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  statusTone,
} from "@/components/ui";
import {
  formatCents,
  formatDate,
  formatRelativeDays,
  tenderStatusLabel,
} from "@/lib/format";
import { LogNote, StageControls } from "./stage-controls";

const STAGE_TONES: Record<string, "neutral" | "accent" | "success" | "danger"> = {
  QUALIFIED: "neutral",
  PROPOSAL: "accent",
  NEGOTIATION: "accent",
  WON: "success",
  LOST: "danger",
};

export default async function OpportunityDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const data = await withSession(async (session) => {
    try {
      return {
        opportunity: await crmService.getOpportunity(id),
        activity: await crmService.activitiesFor("OPPORTUNITY", id),
        session,
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

  if (!data) notFound();
  const { opportunity, activity, session } = data;

  const close = formatRelativeDays(opportunity.expectedCloseAt);
  const weighted =
    opportunity.valueCents === null
      ? null
      : (opportunity.valueCents * BigInt(opportunity.probability)) / 100n;

  return (
    <>
      <div className="mb-4">
        <Link href="/crm/pipeline" className="text-xs text-muted hover:underline">
          ← Pipeline
        </Link>
      </div>

      <PageHeader
        title={opportunity.title}
        description={`${opportunity.reference} · ${opportunity.customer.name}`}
        action={
          <Badge tone={STAGE_TONES[opportunity.stage] ?? "neutral"}>
            {opportunity.stage.toLowerCase()}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Progress"
              description="Probability follows the stage unless you override it"
            />
            <div className="px-5 py-4">
              <StageControls
                opportunityId={opportunity.id}
                stage={opportunity.stage}
                canEdit={session.permissions.has("crm.opportunity.edit")}
                canClose={session.permissions.has("crm.opportunity.close")}
              />
              {opportunity.lostReason && (
                <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  Lost: {opportunity.lostReason}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Activity"
              description="Continuous from first enquiry, including anything logged against the lead"
            />
            {activity.length === 0 ? (
              <EmptyState
                title="Nothing logged yet"
                description="Calls, emails and meetings appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{entry.subject}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDate(entry.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {entry.type.toLowerCase().replace("_", " ")}
                      {entry.owner &&
                        ` · ${entry.owner.firstName} ${entry.owner.lastName}`}
                    </p>
                    {entry.body && (
                      <p className="mt-1 text-sm text-muted">{entry.body}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {session.permissions.has("crm.activity.log") && (
              <LogNote opportunityId={opportunity.id} />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Deal" />
            <dl className="grid gap-4 px-5 py-4">
              <Field label="Value">
                <span className="tabular text-lg font-semibold">
                  {formatCents(opportunity.valueCents)}
                </span>
              </Field>
              <Field label="Weighted">
                <span className="tabular">{formatCents(weighted)}</span>
                <span className="ml-2 text-xs text-muted">
                  at {opportunity.probability}%
                </span>
              </Field>
              <Field label="Expected close">
                {opportunity.expectedCloseAt ? (
                  <>
                    {formatDate(opportunity.expectedCloseAt)}
                    <span className="ml-2 text-xs text-muted">{close.label}</span>
                  </>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Customer">
                <Link
                  href={`/crm/customers/${opportunity.customer.id}`}
                  className="text-accent hover:underline"
                >
                  {opportunity.customer.name}
                </Link>
              </Field>
              <Field label="Contact">
                {opportunity.contact
                  ? `${opportunity.contact.firstName} ${opportunity.contact.lastName}`
                  : "—"}
              </Field>
              <Field label="Owner">
                {opportunity.owner
                  ? `${opportunity.owner.firstName} ${opportunity.owner.lastName}`
                  : "Unassigned"}
              </Field>
              {opportunity.convertedFromLead.length > 0 && (
                <Field label="Origin">
                  Converted from lead{" "}
                  <span className="tabular">
                    {opportunity.convertedFromLead[0].reference}
                  </span>
                </Field>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Linked tender"
              description="One thread from relationship to bid"
            />
            {opportunity.tender ? (
              <div className="px-5 py-4">
                <Link
                  href={`/tenders/${opportunity.tender.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {opportunity.tender.title}
                </Link>
                <p className="mt-1 text-xs text-muted">
                  <span className="tabular">{opportunity.tender.reference}</span>{" "}
                  · closes {formatDate(opportunity.tender.closingAt)}
                </p>
                <div className="mt-2">
                  <Badge tone={statusTone(opportunity.tender.status)}>
                    {tenderStatusLabel(opportunity.tender.status)}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="px-5 py-6 text-center text-xs text-muted">
                Not linked to a tender.
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
