import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { Badge, Card, CardHeader, EmptyState, Icon, PageHeader, StatTile } from "@/components/ui";
import { PersonPicker } from "./picker";

/**
 * One person's month.
 *
 * The roster answers a foreman's question — who is on site next week. This
 * answers the question the person themselves asks, which the system could not
 * answer at all without opening four screens: what am I working, when am I
 * off, and which of those days are already spoken for.
 *
 * A calendar rather than a list, because the shape of a month is the answer.
 * "Six days on, one off" is recognised at a glance in a grid and has to be
 * read line by line in a table.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Shifts the year/month pair by n months, carrying across December. */
function shiftMonth(year: number, month: number, by: number) {
  const date = new Date(Date.UTC(year, month - 1 + by, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export default async function MonthPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; month?: string }>;
}) {
  const params = await searchParams;

  const now = new Date();
  const parsed = /^(\d{4})-(\d{2})$/.exec(params.month ?? "");
  const year = parsed ? Number(parsed[1]) : now.getUTCFullYear();
  const month = parsed ? Number(parsed[2]) : now.getUTCMonth() + 1;

  const data = await withSession(async (session) => {
    const maySeeEveryone = session.permissions.has("hr.employee.view");
    const mine = await hrService.myEmployeeId();

    /*
     * Whose month, in order of what the visitor most likely wants: the person
     * they asked for, their own record, or — for an administrator with no
     * employee record of their own — the first person on the register.
     */
    const people = maySeeEveryone
      ? (await hrService.listEmployees(["ACTIVE", "ON_LEAVE", "SUSPENDED"])).map(
          (employee) => ({
            id: employee.id,
            name: `${employee.firstName} ${employee.lastName}`,
          }),
        )
      : [];

    const personId = params.person ?? mine ?? people[0]?.id ?? null;
    if (!personId) return null;

    return {
      month: await hrService.monthFor(personId, year, month),
      people,
      personId,
      isMine: personId === mine,
    };
  });

  if (!data) redirect("/dashboard");

  const { days, totals, employee } = data.month;

  // Lead the first row with blanks so the 1st lands under its weekday. 0 is
  // Sunday in JavaScript, and a working week here starts on Monday.
  const firstWeekday = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells = [...Array<null>(firstWeekday).fill(null), ...days];

  const previous = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const href = (target: { year: number; month: number }) =>
    `/hr/month?person=${data.personId}&month=${target.year}-${String(target.month).padStart(2, "0")}`;

  return (
    <>
      <PageHeader
        title={data.isMine ? "My month" : employee.name}
        description={`${employee.jobTitle ?? "On the payroll"} · ${monthLabel(year, month)}`}
        action={
          <div className="flex items-center gap-2">
            {data.people.length > 0 && (
              <PersonPicker people={data.people} current={data.personId} />
            )}
            <Link
              href={href(previous)}
              className="grid size-9 place-items-center rounded-[10px] border border-border transition hover:bg-surface-muted"
              aria-label="Previous month"
            >
              <Icon name="chevronRight" size={16} className="rotate-180" />
            </Link>
            <Link
              href={href(next)}
              className="grid size-9 place-items-center rounded-[10px] border border-border transition hover:bg-surface-muted"
              aria-label="Next month"
            >
              <Icon name="chevronRight" size={16} />
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon="calendar"
          label="Days due in"
          value={String(totals.due)}
          hint="Their pattern, less holidays and leave"
        />
        <StatTile
          icon="clock"
          label="Hours"
          value={totals.hours ? String(Math.round(totals.hours * 10) / 10) : "—"}
          hint={totals.hours ? "From the shift worked" : "No shift set on this pattern"}
        />
        <StatTile
          icon="inbox"
          label="On leave"
          value={String(totals.onLeave)}
          hint="Booked or approved"
          tone={totals.onLeave > 0 ? "warning" : "default"}
        />
        <StatTile
          icon="grid"
          label="Placed on site"
          value={String(totals.placed)}
          hint="Days with a roster placement"
        />
      </div>

      <Card>
        <CardHeader
          icon="calendar"
          title={monthLabel(year, month)}
          description="Shaded days are days they are due in. Everything else is a day off, a holiday, or leave"
        />

        {days.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Nothing to show"
            description="That month has no days, which should be impossible."
          />
        ) : (
          <div className="overflow-x-auto p-4">
            <div className="grid min-w-[44rem] grid-cols-7 gap-1.5">
              {WEEKDAYS.map((name) => (
                <span
                  key={name}
                  className="px-1 pb-1 text-[11px] uppercase tracking-wide text-faint"
                >
                  {name}
                </span>
              ))}

              {cells.map((day, index) =>
                day === null ? (
                  <span key={`blank-${index}`} />
                ) : (
                  <div
                    key={day.date}
                    className={`min-h-24 rounded-[10px] border p-1.5 text-xs ${
                      day.leave
                        ? "border-warning/40 bg-warning-soft"
                        : day.holiday
                          ? "border-border bg-accent-soft"
                          : day.due
                            ? "border-border bg-surface"
                            : "border-transparent bg-surface-muted"
                    }`}
                  >
                    <span
                      className={`tabular block font-medium ${
                        day.due ? "" : "text-faint"
                      }`}
                    >
                      {Number(day.date.slice(8, 10))}
                    </span>

                    {day.holiday && (
                      <span className="mt-0.5 block text-[11px] leading-tight text-muted">
                        {day.holiday}
                      </span>
                    )}

                    {day.leave && (
                      <span className="mt-0.5 block leading-tight text-warning">
                        {day.leave.typeName}
                        {day.leave.status === "SUBMITTED" && " (asked)"}
                      </span>
                    )}

                    {day.due && !day.leave && (
                      <>
                        {day.shift ? (
                          <span className="tabular mt-0.5 block leading-tight text-muted">
                            {day.shift.hours}
                          </span>
                        ) : (
                          <span className="mt-0.5 block leading-tight text-faint">
                            Working
                          </span>
                        )}
                        {day.placement && (
                          <span className="mt-0.5 block leading-tight text-faint">
                            {day.placement.projectName ?? "Yard"}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded border border-border bg-surface" />
            Due in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-surface-muted" />
            Not a working day
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-accent-soft" />
            Public holiday
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-warning-soft" />
            Leave
          </span>
          {days.some((day) => day.patternName) && (
            <span className="ml-auto">
              <Badge tone="neutral">
                {[...new Set(days.map((day) => day.patternName).filter(Boolean))].join(
                  " → ",
                )}
              </Badge>
            </span>
          )}
        </div>
      </Card>
    </>
  );
}
