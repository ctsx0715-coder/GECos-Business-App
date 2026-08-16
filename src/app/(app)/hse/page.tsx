import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hseService } from "@/modules/hse/hse.service";
import { daysUntil } from "@/modules/hse/reportability";
import { describeDeadline, KIND_LABELS } from "@/modules/hse/vocabulary";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  StatTile,
} from "@/components/ui";

/**
 * The safety record, and what is late.
 *
 * Two halves, and the order is deliberate. The numbers are what a client asks
 * for in a pre-qualification and what a board looks at once a quarter. The
 * list underneath is what actually keeps somebody out of trouble: a statutory
 * filing nobody made, an action nobody did, and a question nobody answered.
 *
 * The rates are shown with the figure they would become after one more injury.
 * On a contractor's hours these numbers are extremely sensitive — one accident
 * can double the rate — and a safety statistic presented without that is a way
 * of misleading a board with arithmetic.
 */

export const dynamic = "force-dynamic";

function startOfYear(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

export default async function SafetyPage() {
  const now = new Date();
  const from = startOfYear(now);

  const data = await withSession(async (session) => {
    if (!session.permissions.has("hse.incident.view")) return null;
    return {
      record: await hseService.record(from, now),
      late: await hseService.whatIsLate(now),
      mayReport: session.permissions.has("hse.incident.report"),
    };
  });

  if (!data) redirect("/dashboard");

  const { record, late } = data;
  const overdueFilings = late.filings.filter((row) => row.filing.overdue);

  return (
    <>
      <PageHeader
        title="Safety"
        description={`Year to date, against ${record.hoursWorked.toLocaleString("en-ZA")} hours actually worked`}
        action={
          <div className="flex items-center gap-2">
            <ButtonLink href="/hse/incidents" icon="file">
              Register
            </ButtonLink>
            {data.mayReport && (
              <ButtonLink href="/hse/incidents/new" variant="primary" icon="plus">
                Report an incident
              </ButtonLink>
            )}
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon="calendar"
          label="Days since a lost-time injury"
          value={
            record.daysSinceLastLostTime === null
              ? "—"
              : String(record.daysSinceLastLostTime)
          }
          hint={
            record.lastLostTimeAt === null
              ? "None on record"
              : `Last one ${record.lastLostTimeAt.toLocaleDateString("en-ZA", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}`
          }
        />
        {/*
          The rate is shown even when the hours behind it are too thin for it
          to be comparable, because a client asking for the figure does not
          accept "we would rather not" — but what it is shown *with* changes.
          Enough hours and the hint is the sensitivity; too few and the hint
          says so in the plainest terms available, because this is the number
          that gets copied into a pre-qualification document by somebody who
          will never be told which of the two it was.
        */}
        <StatTile
          icon="trend"
          label="Lost-time injury rate"
          value={record.lostTimeRate === null ? "—" : record.lostTimeRate.toFixed(1)}
          hint={
            record.lostTimeRate === null
              ? "No hours worked yet"
              : record.enoughHoursForRate
                ? `One more would make it ${record.lostTimeRateWithOneMore?.toFixed(1)}`
                : `Too few hours to compare — one injury is worth ${record.ratePerInjury?.toFixed(1)} of this`
          }
          tone={
            record.lostTimeRate === null
              ? "default"
              : record.enoughHoursForRate
                ? "warning"
                : "neutral"
          }
        />
        <StatTile
          icon="alert"
          label="Recordable injuries"
          value={String(record.recordableCount)}
          hint={
            record.recordableRate === null || !record.enoughHoursForRate
              ? "Treatment by a doctor or worse"
              : `${record.recordableRate.toFixed(1)} per 200 000 hours`
          }
        />
        <StatTile
          icon="shield"
          label="Fixes that change the job"
          value={
            record.hardControlShare === null ? "—" : `${record.hardControlShare}%`
          }
          hint={
            record.hardControlShare === null
              ? "No corrective actions yet"
              : "The rest depend on people remembering"
          }
          tone={
            record.hardControlShare !== null && record.hardControlShare < 40
              ? "warning"
              : "default"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon="alert"
            title="Filings owed"
            description="The Department of Employment and Labour and the Compensation Fund are separate duties with separate clocks"
          />
          {late.filings.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="Nothing outstanding"
              description="No open incident owes a statutory report that has not been made."
            />
          ) : (
            <ul className="divide-y divide-border">
              {late.filings.map(({ incident, filing }) => {
                const days = daysUntil(filing.dueBy, now);
                return (
                  <li
                    key={`${incident.id}-${filing.under}`}
                    className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/hse/incidents/${incident.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {incident.reference} · {filing.to}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {filing.form} under {filing.under}. {filing.because}
                      </p>
                    </div>
                    <Badge
                      tone={filing.overdue ? "danger" : days <= 2 ? "warning" : "neutral"}
                      icon={filing.overdue ? "alert" : "clock"}
                    >
                      {describeDeadline(days)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            icon="inbox"
            title="Corrective actions"
            description="An incident does not close while one of these is open"
          />
          {late.openActions.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="Nothing owed"
              description="Every corrective action on the register has been done."
            />
          ) : (
            <ul className="divide-y divide-border">
              {late.openActions.slice(0, 8).map((action) => {
                const days = daysUntil(action.dueAt, now);
                return (
                  <li
                    key={action.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/hse/incidents/${action.incident.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {action.description}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {action.incident.reference} ·{" "}
                        {KIND_LABELS[action.incident.kind]}
                        {action.assignedToEmployee &&
                          ` · ${action.assignedToEmployee.firstName} ${action.assignedToEmployee.lastName}`}
                      </p>
                    </div>
                    <Badge
                      tone={days < 0 ? "danger" : days <= 2 ? "warning" : "neutral"}
                      icon={days < 0 ? "alert" : "clock"}
                    >
                      {describeDeadline(days)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {late.unanswered.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            icon="clock"
            title="Waiting on an answer"
            description="Questions whose answer decides whether something has to be reported"
          />
          <ul className="divide-y divide-border">
            {late.unanswered.map(({ incident, question }) => (
              <li key={`${incident.id}-${question}`} className="px-5 py-3">
                <Link
                  href={`/hse/incidents/${incident.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {incident.reference}
                </Link>
                <p className="mt-0.5 text-xs text-muted">{question}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(overdueFilings.length > 0 || late.overdueActions.length > 0) && (
        <p className="mt-6 flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-xs font-medium text-danger">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>
            {overdueFilings.length > 0 &&
              `${overdueFilings.length} statutory ${overdueFilings.length === 1 ? "filing is" : "filings are"} past their deadline. `}
            {late.overdueActions.length > 0 &&
              `${late.overdueActions.length} corrective ${late.overdueActions.length === 1 ? "action is" : "actions are"} overdue. `}
            These dates are worked out from the facts on each incident and are a
            prompt, not advice — a safety officer decides what actually gets filed.
          </span>
        </p>
      )}
    </>
  );
}
