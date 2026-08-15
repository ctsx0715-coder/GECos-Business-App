import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { isoDate } from "@/modules/hr/public-holidays";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { RosterGrid, WeekNav } from "./grid";

/**
 * Who is where, a week at a time.
 *
 * A grid of people against days, because that is the shape of the question a
 * foreman asks on a Friday afternoon. Three things share the row and have to
 * be told apart at a glance: a placement, booked leave, and a day the person
 * was never going to work — a Sunday, a public holiday, or the off week of a
 * rotation. Showing the third as merely empty is how somebody gets rostered
 * onto a day they do not work.
 */

/** The Monday of the week containing a date. */
function mondayOf(date: Date): Date {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay is 0 for Sunday, so Sunday belongs to the week that just ended.
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

function addDays(date: Date, days: number): Date {
  const moved = new Date(date);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved;
}

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; project?: string }>;
}) {
  const params = await searchParams;
  const requested = params.week ? new Date(`${params.week}T00:00:00Z`) : new Date();
  const from = mondayOf(Number.isNaN(requested.getTime()) ? new Date() : requested);
  const to = addDays(from, 6);

  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.roster.view")) return null;

    return {
      roster: await hrService.rosterFor(from, to, {
        projectId: params.project || undefined,
      }),
      projects: (await hrService.rosterProjects()).map((project) => ({
        value: project.id,
        label: project.name,
      })),
      mayManage: session.permissions.has("hr.roster.manage"),
    };
  });

  if (!data) redirect("/dashboard");

  const days = Array.from({ length: 7 }, (_, index) => addDays(from, index));

  return (
    <>
      <PageHeader
        title="Roster"
        description="Who is on which site, and who is away"
        action={<WeekNav from={isoDate(from)} projectId={params.project ?? ""} projects={data.projects} />}
      />

      <Card>
        <CardHeader
          icon="users"
          title={`Week of ${from.toLocaleDateString("en-ZA", {
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          })}`}
          description={
            data.mayManage
              ? "Click a day to place somebody, or a placement to remove it"
              : "Placements are set by HR and the project managers"
          }
        />

        {data.roster.people.length === 0 ? (
          <EmptyState
            icon="users"
            title="Nobody on the payroll yet"
            description="The roster draws on the employee register, so add people before planning a week."
          />
        ) : (
          <RosterGrid
            days={days.map((day) => isoDate(day))}
            people={data.roster.people.map((person) => ({
              ...person,
              assignments: person.assignments.map((assignment) => ({
                ...assignment,
                startsAt: isoDate(assignment.startsAt),
                endsAt: isoDate(assignment.endsAt),
              })),
              leave: person.leave.map((request) => ({
                ...request,
                startsAt: isoDate(request.startsAt),
                endsAt: isoDate(request.endsAt),
              })),
            }))}
            projects={data.projects}
            mayManage={data.mayManage}
          />
        )}
      </Card>
    </>
  );
}
