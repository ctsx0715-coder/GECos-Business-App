import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hseService } from "@/modules/hse/hse.service";
import { daysUntil } from "@/modules/hse/reportability";
import {
  CONTROL_LABELS,
  describeDeadline,
  KIND_LABELS,
  kindTone,
} from "@/modules/hse/vocabulary";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  PageHeader,
} from "@/components/ui";
import {
  AddAction,
  CloseIncident,
  CompleteAction,
  Investigate,
  RecordFiling,
} from "./manage";

/**
 * One incident, and everything owed on it.
 *
 * Laid out in the order a person works through it: what happened, what the law
 * wants told, what is being done about it, and only then the button that says
 * it is finished. That button is last because it is the one that makes
 * everybody stop looking.
 */

export const dynamic = "force-dynamic";

function moment(at: Date): string {
  return at.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const now = new Date();

  const data = await withSession(async (session) => {
    if (!session.permissions.has("hse.incident.view")) return null;
    return {
      incident: await hseService.getById(id).catch(() => null),
      options: session.permissions.has("hse.incident.report")
        ? await hseService.reportingOptions()
        : { projects: [], employees: [] },
      mayInvestigate: session.permissions.has("hse.incident.investigate"),
      mayClose: session.permissions.has("hse.incident.close"),
      mayCompleteActions: session.permissions.has("hse.action.complete"),
    };
  });

  if (!data) redirect("/dashboard");
  if (!data.incident) notFound();

  const { incident } = data;
  const { obligations } = incident;
  const openActions = incident.actions.filter((a) => a.completedAt === null);
  const injured =
    incident.injuredEmployee !== null
      ? `${incident.injuredEmployee.firstName} ${incident.injuredEmployee.lastName}`
      : incident.injuredPersonName;

  return (
    <>
      <PageHeader
        title={incident.reference}
        description={`${KIND_LABELS[incident.kind]} · ${moment(incident.occurredAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={kindTone(incident.kind)}>
              {KIND_LABELS[incident.kind]}
            </Badge>
            {incident.status === "CLOSED" ? (
              <Badge tone="success" icon="check">
                closed
              </Badge>
            ) : (
              <Badge tone="neutral" icon="clock">
                {incident.status === "REPORTED" ? "reported" : "under investigation"}
              </Badge>
            )}
          </div>
        }
      />

      {obligations.atOnce.length > 0 && incident.status !== "CLOSED" && (
        <div className="mb-6 space-y-2">
          {obligations.atOnce.map((instruction) => (
            <p
              key={instruction}
              className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
            >
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              {instruction}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader icon="file" title="What happened" />
            <div className="space-y-4 px-5 py-4">
              <p className="whitespace-pre-line text-sm">{incident.description}</p>
              {incident.immediateAction && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    Done at the time
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">
                    {incident.immediateAction}
                  </p>
                </div>
              )}
              <dl className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <Field label="Site">
                  {incident.project ? (
                    <Link
                      href={`/projects/${incident.project.id}`}
                      className="hover:underline"
                    >
                      {incident.project.name}
                    </Link>
                  ) : (
                    "Yard or office"
                  )}
                </Field>
                <Field label="Whereabouts">{incident.place ?? "—"}</Field>
                <Field label="Who was hurt">{injured ?? "Nobody"}</Field>
                <Field label="Days off normal work">
                  {incident.daysUnableToWork === null
                    ? "Not yet known"
                    : String(incident.daysUnableToWork)}
                </Field>
                <Field label="Reported">{moment(incident.reportedAt)}</Field>
                <Field label="Investigated by">
                  {incident.investigatedBy
                    ? `${incident.investigatedBy.firstName} ${incident.investigatedBy.lastName}`
                    : "Nobody yet"}
                </Field>
              </dl>
              {incident.rootCause && (
                <div className="border-t border-border pt-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    Root cause
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">
                    {incident.rootCause}
                  </p>
                </div>
              )}
            </div>
            {data.mayInvestigate && incident.status !== "CLOSED" && (
              <Investigate
                incidentId={incident.id}
                kind={incident.kind}
                rootCause={incident.rootCause ?? ""}
                daysUnableToWork={incident.daysUnableToWork}
                dangerousOccurrence={incident.dangerousOccurrence}
              />
            )}
          </Card>

          <Card>
            <CardHeader
              icon="inbox"
              title="Corrective actions"
              description="What stops it happening again. The incident does not close while one is open"
              action={
                data.mayInvestigate &&
                incident.status !== "CLOSED" && (
                  <AddAction
                    incidentId={incident.id}
                    employees={data.options.employees}
                  />
                )
              }
            />
            {incident.actions.length === 0 ? (
              <EmptyState
                icon="shield"
                title="Nothing decided yet"
                description="An investigation that ends without a corrective action has found a cause nobody is fixing."
              />
            ) : (
              <ul className="divide-y divide-border">
                {incident.actions.map((action) => {
                  const days = daysUntil(action.dueAt, now);
                  const done = action.completedAt !== null;
                  return (
                    <li key={action.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-medium ${done ? "text-muted line-through" : ""}`}
                          >
                            {action.description}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {CONTROL_LABELS[action.control]}
                            {action.assignedToEmployee &&
                              ` · ${action.assignedToEmployee.firstName} ${action.assignedToEmployee.lastName}`}
                            {done &&
                              action.completedBy &&
                              ` · done by ${action.completedBy.firstName} ${action.completedBy.lastName}`}
                          </p>
                          {action.completedNote && (
                            <p className="mt-1 text-xs text-muted">
                              {action.completedNote}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {done ? (
                            <Badge tone="success" icon="check">
                              done
                            </Badge>
                          ) : (
                            <>
                              <Badge
                                tone={days < 0 ? "danger" : days <= 2 ? "warning" : "neutral"}
                                icon={days < 0 ? "alert" : "clock"}
                              >
                                {describeDeadline(days)}
                              </Badge>
                              {data.mayCompleteActions && (
                                <CompleteAction actionId={action.id} />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              icon="shield"
              title="What the law wants told"
              description="Two separate duties, worked out from the facts above"
            />
            {obligations.filings.length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title="Nothing to file"
                description="On these facts neither the Department nor the Compensation Fund has to be told. Change the classification or the days off work and this is worked out again."
              />
            ) : (
              <ul className="divide-y divide-border">
                {obligations.filings.map((filing) => {
                  const days = daysUntil(filing.dueBy, now);
                  return (
                    <li key={filing.under} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-medium">{filing.to}</p>
                        {filing.filedAt ? (
                          <Badge tone="success" icon="check">
                            filed
                          </Badge>
                        ) : (
                          <Badge
                            tone={filing.overdue ? "danger" : days <= 2 ? "warning" : "neutral"}
                            icon={filing.overdue ? "alert" : "clock"}
                          >
                            {describeDeadline(days)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Form {filing.form}, {filing.under}. {filing.because}
                      </p>
                      <p className="mt-1 text-xs text-faint">
                        Due{" "}
                        {filing.dueBy.toLocaleDateString("en-ZA", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                        {filing.filedAt &&
                          ` · filed ${filing.filedAt.toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "long",
                            timeZone: "UTC",
                          })}`}
                      </p>
                      {data.mayInvestigate && !filing.filedAt && (
                        <RecordFiling
                          incidentId={incident.id}
                          to={filing.under.startsWith("OHSA") ? "DEPARTMENT" : "FUND"}
                          label={filing.to}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {obligations.unanswered.length > 0 && (
              <div className="border-t border-border px-5 py-3">
                {obligations.unanswered.map((question) => (
                  <p
                    key={question}
                    className="flex items-start gap-2 text-xs font-medium text-warning"
                  >
                    <Icon name="clock" size={12} className="mt-0.5 shrink-0" />
                    {question}
                  </p>
                ))}
              </div>
            )}

            <p className="border-t border-border px-5 py-3 text-xs text-muted">
              {obligations.mustBeRecorded
                ? "Kept in the incident book for three years (GAR 9)."
                : "No statutory three-year record is required for this one."}{" "}
              Nothing here files anything with anybody — it says what is owed,
              and a safety officer decides what actually gets sent.
            </p>
            {incident.externalReference && (
              <p className="border-t border-border px-5 py-3 text-xs text-muted">
                Their reference: {incident.externalReference}
              </p>
            )}
          </Card>

          {incident.status !== "CLOSED" && data.mayClose && (
            <Card>
              <CardHeader icon="check" title="Close it out" />
              <CloseIncident
                incidentId={incident.id}
                openActions={openActions.length}
                rootCause={incident.rootCause ?? ""}
              />
            </Card>
          )}

          {incident.status === "CLOSED" && (
            <Card>
              <CardHeader icon="check" title="Closed" />
              <div className="px-5 py-4 text-sm text-muted">
                {incident.closedAt && moment(incident.closedAt)}
                {incident.closedBy &&
                  ` by ${incident.closedBy.firstName} ${incident.closedBy.lastName}`}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
