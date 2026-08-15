import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { crossesMidnight, describeShift, workedHours } from "@/modules/hr/shifts";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { NewShift, ShiftEditor } from "./manage";

/**
 * Shifts: which hours, as opposed to which days.
 *
 * Kept apart from patterns deliberately. The same six-day pattern is worked on
 * days by one crew and nights by another, and a rotation swaps the shift while
 * the days stay put — one table each keeps that from becoming a list of
 * "six-day days", "six-day nights", "six-day afternoons".
 */

export default async function ShiftsPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.leave.configure")) return null;
    return { shifts: await hrService.listShifts(true) };
  });

  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Shifts"
        description="The hours of the day a pattern is worked"
        action={<NewShift />}
      />

      <Card>
        <CardHeader
          icon="clock"
          title="Shifts"
          description="Attach one to a work pattern, and a timesheet can be measured against it"
        />

        {data.shifts.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No shifts yet"
            description="Add the ones the sites actually run — days, nights, the Saturday half-day."
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.shifts.map((shift) => (
              <li key={shift.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {shift.name}
                      {crossesMidnight(shift) && (
                        <span className="ml-2">
                          <Badge tone="info">Overnight</Badge>
                        </span>
                      )}
                      {!shift.isActive && (
                        <span className="ml-2">
                          <Badge tone="neutral">Retired</Badge>
                        </span>
                      )}
                    </span>
                    <span className="tabular block text-xs text-faint">
                      {shift.code} · {describeShift(shift)}
                      {shift.breakMinutes > 0 &&
                        ` · ${shift.breakMinutes} min break`}
                    </span>
                  </span>

                  <span className="shrink-0 text-right text-sm">
                    <span className="tabular font-medium">
                      {workedHours(shift)}
                    </span>
                    <span className="ml-1 text-xs text-muted">hours</span>
                    <span className="block text-xs text-faint">
                      {shift._count.patterns}{" "}
                      {shift._count.patterns === 1 ? "pattern" : "patterns"}
                    </span>
                  </span>
                </div>

                <ShiftEditor
                  shift={{
                    id: shift.id,
                    code: shift.code,
                    name: shift.name,
                    description: shift.description ?? "",
                    startsAtMinutes: shift.startsAtMinutes,
                    endsAtMinutes: shift.endsAtMinutes,
                    breakMinutes: shift.breakMinutes,
                    sortOrder: shift.sortOrder,
                    isActive: shift.isActive,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
