import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { isoDate } from "@/modules/hr/public-holidays";
import { describeDuration, describeMoment } from "@/modules/hr/timesheets";
import {
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { ClockSomebody, MyClock, Timesheet, type Row } from "./manage";

/**
 * What was actually worked.
 *
 * Every other screen in Work cycles is a plan. This is the record, and the two
 * are deliberately kept apart: reconciling them is the point, and a plan that
 * overwrites itself with reality can no longer be compared to it.
 *
 * The clock comes first and is the largest thing on the page, because the
 * person using it is standing at a gate at ten past six. Everything else —
 * the week, the variance, the sign-off — is for whoever reads it afterwards.
 */

function mondayOf(date: Date): Date {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

function addDays(date: Date, days: number): Date {
  const moved = new Date(date);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved;
}

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; person?: string }>;
}) {
  const params = await searchParams;
  const requested = params.week ? new Date(`${params.week}T00:00:00Z`) : new Date();
  const from = mondayOf(Number.isNaN(requested.getTime()) ? new Date() : requested);
  const to = addDays(from, 6);

  const data = await withSession(async (session) => {
    const mayView = session.permissions.has("hr.timesheet.view");
    const mayRecord = session.permissions.has("hr.timesheet.record");
    const mayManage = session.permissions.has("hr.timesheet.manage");
    const mayApprove = session.permissions.has("hr.timesheet.approve");

    const mine = await hrService.myOpenEntry();
    if (!mayView && !mine) return null;

    /*
     * Somebody with no permission beyond clocking themselves sees their own
     * week and nobody else's. The service enforces it either way; this only
     * decides which question to ask it.
     */
    const sheet = mayView
      ? await hrService.timesheetFor(from, to)
      : await hrService.timesheetFor(from, to, { employeeId: mine!.employeeId });

    const onTheClock = mayView ? await hrService.whoIsOnTheClock() : [];

    const people = mayManage
      ? (await hrService.listEmployees(["ACTIVE", "ON_LEAVE"])).map((employee) => ({
          id: employee.id,
          name: `${employee.firstName} ${employee.lastName}`,
          onTheClock: onTheClock.some((entry) => entry.employeeId === employee.id),
        }))
      : [];

    return { sheet, onTheClock, people, mine, mayView, mayRecord, mayManage, mayApprove };
  });

  if (!data) redirect("/dashboard");

  const rows: Row[] = data.sheet.rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    workedOn: isoDate(row.workedOn),
    clockedIn: describeMoment(row.clockedInAt),
    clockedOut: row.clockedOutAt ? describeMoment(row.clockedOutAt) : null,
    breakMinutes: row.breakMinutes,
    minutes: row.minutes,
    projectName: row.projectName,
    shiftName: row.shiftName,
    overtime: row.overtime,
    undertime: row.undertime,
    approved: row.approvedAt !== null,
    approvedBy: row.approvedBy,
    running: row.running,
    looksForgotten: row.looksForgotten,
    note: row.note,
    clockedInAt: row.clockedInAt.toISOString(),
    clockedOutAt: row.clockedOutAt?.toISOString() ?? null,
  }));

  const week = (offset: number) =>
    `/hr/timesheets?week=${isoDate(addDays(from, offset * 7))}`;

  return (
    <>
      <PageHeader
        title="Timesheets"
        description="What was actually worked, against what was planned"
        action={
          <div className="flex items-center gap-2">
            <Link
              href={week(-1)}
              aria-label="Previous week"
              className="grid size-9 place-items-center rounded-[10px] border border-border transition hover:bg-surface-muted"
            >
              <Icon name="chevronRight" size={16} className="rotate-180" />
            </Link>
            <Link
              href={week(1)}
              aria-label="Next week"
              className="grid size-9 place-items-center rounded-[10px] border border-border transition hover:bg-surface-muted"
            >
              <Icon name="chevronRight" size={16} />
            </Link>
          </div>
        }
      />

      {data.mine && data.mayRecord && (
        <div className="mb-6">
          <MyClock
            employeeId={data.mine.employeeId}
            open={
              data.mine.entry
                ? {
                    since: describeMoment(data.mine.entry.since),
                    minutesSoFar: data.mine.entry.minutesSoFar,
                    projectName: data.mine.entry.projectName,
                  }
                : null
            }
          />
        </div>
      )}

      {data.mayView && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon="clock"
            label="On the clock now"
            value={String(data.onTheClock.length)}
            hint="Clocked in and not out"
            tone={data.onTheClock.length > 0 ? "warning" : "default"}
          />
          <StatTile
            icon="calendar"
            label="Worked this week"
            value={describeDuration(data.sheet.totals.minutes)}
            hint="Across everybody, less breaks"
          />
          <StatTile
            icon="trend"
            label="Overtime"
            value={describeDuration(data.sheet.totals.overtime)}
            hint="Beyond the shift that was planned"
            tone={data.sheet.totals.overtime > 0 ? "warning" : "default"}
          />
          <StatTile
            icon="inbox"
            label="Awaiting sign-off"
            value={String(data.sheet.totals.awaiting)}
            hint="Nothing is paid until it is signed"
          />
        </div>
      )}

      {data.mayView && data.onTheClock.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            icon="clock"
            title="On the clock"
            description="Right now, and how long they have been on"
          />
          <ul className="divide-y divide-border">
            {data.onTheClock.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{entry.name}</span>
                  <span className="block text-xs text-faint">
                    since {describeMoment(entry.since)}
                    {entry.projectName ? ` · ${entry.projectName}` : ""}
                    {entry.shiftName ? ` · ${entry.shiftName}` : ""}
                  </span>
                </span>
                <span className="tabular text-sm">
                  {describeDuration(entry.minutesSoFar)}
                </span>
                {entry.looksForgotten && (
                  <span className="text-xs font-medium text-danger">
                    longer than anybody works — probably never clocked out
                  </span>
                )}
              </li>
            ))}
          </ul>
          {data.mayManage && data.people.length > 0 && (
            <ClockSomebody people={data.people} />
          )}
        </Card>
      )}

      {data.mayView && data.onTheClock.length === 0 && data.mayManage && (
        <Card className="mb-4">
          <CardHeader
            icon="clock"
            title="Nobody is on the clock"
            description="Clock somebody in for whom the phone is not the tool"
          />
          {data.people.length > 0 && <ClockSomebody people={data.people} />}
        </Card>
      )}

      <Card>
        <CardHeader
          icon="history"
          title={`Week of ${from.toLocaleDateString("en-ZA", {
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          })}`}
          description={
            data.mayApprove
              ? "Sign off what is right. An entry that has been signed is not edited — withdraw first"
              : "Hours are worked out from the two moments, never typed in"
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            icon="clock"
            title="Nothing recorded this week"
            description="Clocking in creates the entry; clocking out closes it. Nobody types a number of hours."
          />
        ) : (
          <Timesheet
            rows={rows}
            mayApprove={data.mayApprove}
            mayManage={data.mayManage}
          />
        )}
      </Card>
    </>
  );
}
