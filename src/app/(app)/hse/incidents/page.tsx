import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hseService } from "@/modules/hse/hse.service";
import { daysUntil } from "@/modules/hse/reportability";
import {
  describeDeadline,
  KIND_LABELS,
  kindTone,
} from "@/modules/hse/vocabulary";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";

/**
 * Everything that has happened, worst and most recent first.
 *
 * Near misses sit in the same list as fatalities on purpose. They are the same
 * event with a different amount of luck in it, and a register that only holds
 * the ones that drew blood has thrown away every warning it was given.
 *
 * What each row carries beyond the description is whether anything is owed on
 * it — a filing, an action — because the alternative is opening thirty
 * incidents to find the two that are late.
 */

export const dynamic = "force-dynamic";

export default async function IncidentRegisterPage() {
  const now = new Date();

  const data = await withSession(async (session) => {
    if (!session.permissions.has("hse.incident.view")) return null;
    return {
      incidents: await hseService.list(),
      mayReport: session.permissions.has("hse.incident.report"),
    };
  });

  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Incident register"
        description="Everything reported, from a near miss to the worst day the company has had"
        action={
          data.mayReport && (
            <ButtonLink href="/hse/incidents/new" variant="primary" icon="plus">
              Report an incident
            </ButtonLink>
          )
        }
      />

      <Card>
        <CardHeader
          icon="file"
          title={`${data.incidents.length} ${data.incidents.length === 1 ? "incident" : "incidents"}`}
          description="Most recent first"
        />

        {data.incidents.length === 0 ? (
          <EmptyState
            icon="shield"
            title="Nothing reported yet"
            description="An empty register is either a very good year or a reporting culture that has not started. Only one of them shows up in the near-miss count."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">Incident</th>
                  <th className="px-4 py-2 font-medium">Kind</th>
                  <th className="px-4 py-2 font-medium">Where</th>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.incidents.map((incident) => {
                  const outstanding = incident.obligations.filings.filter(
                    (filing) => filing.filedAt === null,
                  );
                  const worst = outstanding.reduce<number | null>(
                    (soonest, filing) => {
                      const days = daysUntil(filing.dueBy, now);
                      return soonest === null || days < soonest ? days : soonest;
                    },
                    null,
                  );

                  return (
                    <tr key={incident.id} className="align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/hse/incidents/${incident.id}`}
                          className="font-medium hover:underline"
                        >
                          {incident.reference}
                        </Link>
                        <p className="mt-0.5 max-w-md truncate text-xs text-muted">
                          {incident.description}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={kindTone(incident.kind)}>
                          {KIND_LABELS[incident.kind]}
                        </Badge>
                        {incident.status === "CLOSED" && (
                          <span className="ml-1.5">
                            <Badge tone="success" icon="check">
                              closed
                            </Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {incident.project?.name ?? "Yard or office"}
                        {incident.place && (
                          <span className="block text-faint">{incident.place}</span>
                        )}
                      </td>
                      <td className="tabular px-4 py-3 text-xs text-muted">
                        {incident.occurredAt.toLocaleDateString("en-ZA", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {worst !== null && (
                            <Badge
                              tone={worst < 0 ? "danger" : worst <= 2 ? "warning" : "info"}
                              icon={worst < 0 ? "alert" : "clock"}
                            >
                              {outstanding.length === 1
                                ? `1 filing ${describeDeadline(worst)}`
                                : `${outstanding.length} filings, soonest ${describeDeadline(worst)}`}
                            </Badge>
                          )}
                          {incident._count.actions > 0 && (
                            <Badge tone="neutral" icon="inbox">
                              {incident._count.actions}{" "}
                              {incident._count.actions === 1 ? "action" : "actions"}
                            </Badge>
                          )}
                          {incident.obligations.unanswered.length > 0 && (
                            <Badge tone="warning" icon="clock">
                              needs an answer
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
