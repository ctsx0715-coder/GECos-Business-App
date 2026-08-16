import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { asHours } from "@/modules/hr/payroll";
import { isoDate } from "@/modules/hr/public-holidays";
import { describeDuration } from "@/modules/hr/timesheets";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { PeriodPicker, PolicyEditor } from "./manage";

/**
 * The pay run.
 *
 * Hours, split the way they are paid, and nothing else. There is no rate in
 * this system and no money on this screen: the export hands categories and
 * multipliers to the payroll package, which holds what people earn. That is a
 * deliberate boundary — salaries in a database that has not cleared the RLS
 * and MFA gate would be the single worst thing we could put in it, and every
 * South African payroll package expects to be fed hours anyway.
 *
 * Only signed-off time is counted. What is unsigned is shown beside the total
 * rather than folded into it, because "you are about to pay eleven hours short
 * and here is whose" is the one thing this screen must not bury.
 */

/** The first of the current month, and the last day of it. */
function thisMonth(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: isoDate(from), to: isoDate(to) };
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const fallback = thisMonth();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "")
    ? params.from!
    : fallback.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : fallback.to;

  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.payroll.export")) return null;

    return {
      period: await hrService.payrollFor(
        new Date(`${from}T00:00:00.000Z`),
        new Date(`${to}T00:00:00.000Z`),
      ),
      policy: await hrService.payrollPolicy(),
    };
  });

  if (!data) redirect("/dashboard");

  const { period, policy } = data;

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Signed-off hours, split into what each is paid at"
        action={<PeriodPicker from={from} to={to} />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon="clock"
          label="Ordinary"
          value={`${asHours(period.totals.ordinary)}h`}
          hint="Within the ordinary day and week"
        />
        <StatTile
          icon="trend"
          label="Overtime"
          value={`${asHours(period.totals.overtime)}h`}
          hint={`Paid at ×${period.policy.overtimeMultiplier}`}
          tone={period.totals.overtime > 0 ? "warning" : "default"}
        />
        <StatTile
          icon="calendar"
          label="Sunday & holiday"
          value={`${asHours(period.totals.sunday + period.totals.holiday)}h`}
          hint={`Paid at ×${period.policy.sundayMultiplier}`}
        />
        <StatTile
          icon="alert"
          label="Not signed off"
          value={String(period.totals.unsignedEntries)}
          hint="Entries left out of this export"
          tone={period.totals.unsignedEntries > 0 ? "danger" : "default"}
        />
      </div>

      {(period.totals.unsignedEntries > 0 || period.totals.runningEntries > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
          <Icon name="alert" size={16} className="text-warning" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">
              {period.totals.unsignedEntries > 0 &&
                `${period.totals.unsignedEntries} entries in this period have not been signed off`}
              {period.totals.unsignedEntries > 0 &&
                period.totals.runningEntries > 0 &&
                ", and "}
              {period.totals.runningEntries > 0 &&
                `${period.totals.runningEntries} are still running`}
              .
            </span>{" "}
            <span className="text-muted">
              None of them are in the figures above or in the export. Sign them
              off on the timesheet and come back.
            </span>
          </span>
        </div>
      )}

      <Card>
        <CardHeader
          icon="users"
          title={`${from} to ${to}`}
          description="One row per person, in decimal hours — the form every payroll package takes"
          action={
            period.totals.breaches > 0 ? (
              <Badge tone="warning" icon="alert">
                {period.totals.breaches} over the BCEA limit
              </Badge>
            ) : undefined
          }
        />

        {period.people.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No signed-off time in this period"
            description="Only entries somebody has signed for are counted. Sign a week off on the timesheet and it appears here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 text-right font-medium">Ordinary</th>
                  <th className="px-3 py-2 text-right font-medium">Overtime</th>
                  <th className="px-3 py-2 text-right font-medium">Sunday</th>
                  <th className="px-3 py-2 text-right font-medium">Holiday</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {period.people.map((person) => (
                  <tr key={person.employeeId}>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{person.name}</span>
                      <span className="tabular block text-xs text-faint">
                        {person.employeeNumber}
                        {person.department ? ` · ${person.department}` : ""}
                        {` · ${
                          // A rotation averages to a fraction of a week —
                          // 14 on and 7 off is 4.7 days — and the ordinary
                          // day length is chosen from the raw figure. Only
                          // the reading of it is rounded.
                          Math.round(person.workingDaysPerWeek * 10) / 10
                        }-day week`}
                      </span>
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {person.ordinary > 0 ? (
                        asHours(person.ordinary)
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {person.overtime > 0 ? (
                        <span className="text-warning">{asHours(person.overtime)}</span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {person.sunday > 0 ? asHours(person.sunday) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {person.holiday > 0 ? asHours(person.holiday) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-3 text-right font-medium">
                      {asHours(person.total)}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {person.breaches.length > 0 && (
                        <span className="block text-warning">
                          {person.breaches
                            .map((breach) =>
                              breach.kind === "DAILY_OVERTIME"
                                ? `${describeDuration(breach.minutes)} overtime on ${breach.date}`
                                : `${describeDuration(breach.minutes)} overtime in a week`,
                            )
                            .join("; ")}
                        </span>
                      )}
                      {person.unsignedEntries > 0 && (
                        <span className="block text-danger">
                          {describeDuration(person.unsignedMinutes)} not signed off
                        </span>
                      )}
                      {person.breaches.length === 0 &&
                        person.unsignedEntries === 0 && (
                          <span className="text-faint">—</span>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          icon="shield"
          title="How hours are split"
          description="The BCEA's numbers by default. A bargaining council agreement raises them"
          action={
            <PolicyEditor
              policy={{
                ordinaryMinutesPerDayShortWeek: policy.ordinaryMinutesPerDayShortWeek,
                ordinaryMinutesPerDayLongWeek: policy.ordinaryMinutesPerDayLongWeek,
                ordinaryMinutesPerWeek: policy.ordinaryMinutesPerWeek,
                maxOvertimeMinutesPerDay: policy.maxOvertimeMinutesPerDay,
                maxOvertimeMinutesPerWeek: policy.maxOvertimeMinutesPerWeek,
                overtimeMultiplier: Number(policy.overtimeMultiplier),
                sundayMultiplier: Number(policy.sundayMultiplier),
                holidayMultiplier: Number(policy.holidayMultiplier),
              }}
            />
          }
        />
        <ul className="divide-y divide-border text-sm">
          <li className="px-5 py-2.5">
            Ordinary hours: {asHours(policy.ordinaryMinutesPerDayShortWeek)} a day on
            a five-day week, {asHours(policy.ordinaryMinutesPerDayLongWeek)} on six,{" "}
            {asHours(policy.ordinaryMinutesPerWeek)} in a week — whichever is
            reached first.
          </li>
          <li className="px-5 py-2.5">
            Everything beyond that is overtime at ×{Number(policy.overtimeMultiplier)}.
            A whole Sunday is ×{Number(policy.sundayMultiplier)} and a whole public
            holiday ×{Number(policy.holidayMultiplier)}, from the first minute rather
            than after the ordinary hours.
          </li>
          <li className="px-5 py-2.5 text-muted">
            More than {asHours(policy.maxOvertimeMinutesPerDay)} hours of overtime in
            a day or {asHours(policy.maxOvertimeMinutesPerWeek)} in a week is past
            what the BCEA allows. It is reported, never withheld — the hours were
            worked and payroll still has to pay them.
          </li>
        </ul>
      </Card>
    </>
  );
}
