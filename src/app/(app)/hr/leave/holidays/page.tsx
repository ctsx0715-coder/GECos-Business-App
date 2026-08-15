import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { AddHolidayInline, GenerateYear, RemoveHoliday } from "./manage";

/**
 * The days the company is closed.
 *
 * The twelve statutory holidays are generated, including the two that move
 * with Easter and the Act's rule about Sundays. Everything else — a builders'
 * shutdown, an election day proclaimed six weeks out — is added here, because
 * no calculation can know about them and a leave count that ignores them
 * charges people for days they were never at work.
 */

/** Which years to show, and offer to generate. */
function yearsToShow(): number[] {
  const thisYear = new Date().getUTCFullYear();
  return [thisYear, thisYear + 1];
}

export default async function HolidaysPage() {
  const years = yearsToShow();

  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.leave.configure")) return null;

    return {
      calendars: await Promise.all(
        years.map(async (year) => ({
          year,
          holidays: await hrService.listHolidays(
            new Date(Date.UTC(year, 0, 1)),
            new Date(Date.UTC(year, 11, 31)),
          ),
        })),
      ),
    };
  });

  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Public holidays"
        description="Days off, which leave is never charged for"
      />

      {data.calendars.map(({ year, holidays }) => (
        <Card key={year} className="mb-4">
          <CardHeader
            icon="calendar"
            title={String(year)}
            description={
              holidays.length === 0
                ? "Nothing recorded yet"
                : `${holidays.length} days off`
            }
            action={<GenerateYear year={year} />}
          />

          {holidays.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={`No holidays recorded for ${year}`}
              description="Generate the statutory calendar, then add any shutdown days on top of it."
            />
          ) : (
            <ul className="divide-y divide-border">
              {holidays.map((holiday) => (
                <li key={holiday.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="tabular w-32 shrink-0 text-sm text-muted">
                    {formatDate(holiday.observedOn)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {holiday.name}
                    {holiday.notes && (
                      <span className="block text-xs font-normal text-faint">
                        {holiday.notes}
                      </span>
                    )}
                  </span>
                  {!holiday.isStatutory && (
                    <Badge tone="neutral">Company</Badge>
                  )}
                  <RemoveHoliday holidayId={holiday.id} name={holiday.name} />
                </li>
              ))}
            </ul>
          )}

          <AddHolidayInline year={year} />
        </Card>
      ))}
    </>
  );
}
