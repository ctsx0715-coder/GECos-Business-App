import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { isoDate } from "@/modules/hr/public-holidays";
import { describePattern } from "@/modules/hr/work-patterns";
import { describeShift } from "@/modules/hr/shifts";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { RotationBoard, type Row } from "./manage";

/**
 * Whose turn it is.
 *
 * Two questions on one screen, because they are asked together. Who is on
 * which pattern, and who has been on it too long — a foreman moving the night
 * crew wants the second answer while he is deciding the first, not in a report
 * he opens at the end of the quarter.
 *
 * The fairness figure never stops anybody. A rule that refused would be
 * obeyed by not recording who is on nights, and a system that is wrong about
 * that cannot tell anybody they have had too many. The reasoning is in
 * `src/modules/hr/rotation.ts`.
 */

export default async function RotationPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.roster.view")) return null;

    /*
     * Who works when is not a secret from the crew — the roster already says
     * as much, and the baseline employee role can read this screen for the
     * same reason. How often somebody has drawn nights is a different thing:
     * it is a prompt aimed at whoever assigns the work, and it names people.
     * So the table is for everybody and the fairness figures are not.
     */
    const mayManage = session.permissions.has("hr.roster.manage");

    const [board, patterns, shifts] = await Promise.all([
      hrService.assignmentBoard(),
      hrService.listWorkPatterns(),
      hrService.listShifts(),
    ]);

    return {
      rows: board.map(
        (row): Row => ({
          id: row.id,
          name: row.name,
          employeeNumber: row.employeeNumber,
          jobTitle: row.jobTitle,
          department: row.department,
          patternName: row.patternName,
          onDefaultPattern: row.onDefaultPattern,
          shiftName: row.shiftName,
          since: row.since ? isoDate(row.since) : null,
          until: row.until ? isoDate(row.until) : null,
          turns: mayManage ? row.turns : 0,
          limit: mayManage ? row.limit : null,
          concern: mayManage ? row.concern : null,
          next: row.next
            ? {
                id: row.next.id,
                startsOn: isoDate(row.next.startsOn),
                endsOn: row.next.endsOn ? isoDate(row.next.endsOn) : null,
                patternName: row.next.patternName,
                shiftName: row.next.shiftName,
                due: row.next.due,
              }
            : null,
        }),
      ),
      patterns: patterns.map((pattern) => ({
        id: pattern.id,
        name: pattern.name,
        days: describePattern({
          cycleDays: pattern.cycleDays,
          workingDayIndexes: pattern.workingDayIndexes,
          anchorOn: pattern.anchorOn,
        }),
        shiftName: pattern.shift?.name ?? null,
        rotationWeeks: pattern.rotationWeeks,
        maxConsecutiveTurns: pattern.maxConsecutiveTurns,
      })),
      shifts: shifts.map((shift) => ({
        id: shift.id,
        label: `${shift.name} (${describeShift(shift)})`,
      })),
      mayManage,
    };
  });

  if (!data) redirect("/dashboard");

  const watched = data.rows.filter((row) => row.concern);

  return (
    <>
      <PageHeader
        title="Rotation"
        description="Who works which pattern and shift, and whose turn has come round too often"
      />

      {watched.length > 0 && (
        <Card>
          <CardHeader
            icon="shield"
            title="Fairness watch"
            description="Counted from the turns recorded here — nothing has been refused"
          />
          <ul className="divide-y divide-border">
            {watched.map((row) => (
              <li key={row.id} className="px-5 py-3 text-sm">
                <span className="block">{row.concern}</span>
                <span className="block text-xs text-faint">
                  {row.patternName} allows {row.limit} in a row before it says
                  something. Assign somebody else the next turn, or leave it —
                  this is a prompt, not a rule.
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          icon="users"
          title="The payroll"
          description={
            data.mayManage
              ? "Tick everybody who is moving, then assign the pattern once"
              : "Patterns and shifts are set by HR and the site managers"
          }
        />

        {data.rows.length === 0 ? (
          <EmptyState
            icon="users"
            title="Nobody on the payroll yet"
            description="Patterns are assigned to employees, so add people to the register first."
          />
        ) : data.patterns.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No patterns to assign"
            description="Build a work pattern first — until one exists, everybody is assumed to work Monday to Friday."
          />
        ) : (
          <div className="p-5">
            <RotationBoard
              rows={data.rows}
              patterns={data.patterns}
              shifts={data.shifts}
              mayManage={data.mayManage}
            />
          </div>
        )}
      </Card>
    </>
  );
}
