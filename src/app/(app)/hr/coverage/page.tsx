import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { isoDate } from "@/modules/hr/public-holidays";
import { describeShift } from "@/modules/hr/shifts";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { NewStaffingRule, StaffingRuleEditor } from "./manage";

/**
 * Are we short next week?
 *
 * The roster says who is placed and the leave register says who is away.
 * Neither knows how many people were supposed to be there, so nobody could ask
 * the one question that matters on a Friday afternoon. A rule supplies the
 * missing number and this screen does the subtraction.
 *
 * Short and over are not shown alike. Being short means work does not happen;
 * being over means it cost more than it needed to. One is red and one is a
 * note, because dressing them as equal problems trains people to ignore both.
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

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const requested = params.week ? new Date(`${params.week}T00:00:00Z`) : new Date();
  const from = mondayOf(Number.isNaN(requested.getTime()) ? new Date() : requested);
  const to = addDays(from, 6);

  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.roster.view")) return null;

    const employees = session.permissions.has("hr.employee.view")
      ? await hrService.listEmployees(["ACTIVE", "ON_LEAVE"])
      : [];

    return {
      coverage: await hrService.coverageFor(from, to),
      rules: await hrService.listStaffingRules(true),
      projects: (await hrService.rosterProjects()).map((project) => ({
        value: project.id,
        label: project.name,
      })),
      shifts: (await hrService.listShifts()).map((shift) => ({
        value: shift.id,
        label: `${shift.name} (${describeShift(shift)})`,
      })),
      departments: [
        ...new Set(employees.map((employee) => employee.department).filter(Boolean)),
      ].sort() as string[],
      mayManage: session.permissions.has("hr.roster.manage"),
    };
  });

  if (!data) redirect("/dashboard");

  const { coverage } = data;
  const week = (offset: number) =>
    `/hr/coverage?week=${isoDate(addDays(from, offset * 7))}`;

  return (
    <>
      <PageHeader
        title="Coverage"
        description="How many people each site and trade needs, against how many it is getting"
        action={
          <div className="flex items-center gap-2">
            {data.mayManage && (
              <NewStaffingRule
                projects={data.projects}
                shifts={data.shifts}
                departments={data.departments}
              />
            )}
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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          icon="alert"
          label="Rules coming up short"
          value={String(coverage.totals.short)}
          hint="Somewhere in this week"
          tone={coverage.totals.short > 0 ? "danger" : "default"}
        />
        <StatTile
          icon="calendar"
          label="Short days"
          value={String(coverage.totals.shortDays)}
          hint="Rule-days below the minimum"
          tone={coverage.totals.shortDays > 0 ? "warning" : "default"}
        />
        <StatTile
          icon="users"
          label="Overstaffed rules"
          value={String(coverage.totals.over)}
          hint="More hands than the rule wants"
        />
      </div>

      <Card>
        <CardHeader
          icon="grid"
          title={`Week of ${from.toLocaleDateString("en-ZA", {
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          })}`}
          description="A cell is how many people are due in that the rule counts, against what it asks for"
        />

        {coverage.rules.length === 0 ? (
          <EmptyState
            icon="grid"
            title="No staffing rules yet"
            description="Until one exists there is nothing to be short of. A rule says how many people a site, a trade or the company needs, and on which days."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">Rule</th>
                  {coverage.days.map((iso, index) => (
                    <th key={iso} className="px-2 py-2 text-center font-medium">
                      {DAY_NAMES[index]}
                      <span className="tabular ml-1 font-normal">
                        {Number(iso.slice(8, 10))}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {coverage.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="px-4 py-3 align-top">
                      <span className="block font-medium">
                        {rule.name}
                        {rule.verdict === "SHORT" && (
                          <span className="ml-2">
                            <Badge tone="danger" icon="alert">
                              short {rule.worstShortfall}
                            </Badge>
                          </span>
                        )}
                        {rule.verdict === "OVER" && (
                          <span className="ml-2">
                            <Badge tone="warning">over</Badge>
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-faint">
                        {[
                          rule.projectName ?? "Whole company",
                          rule.department,
                          rule.shiftName,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {" · "}
                        {rule.summary}
                      </span>
                    </td>

                    {rule.cells.map((cell) => (
                      <td key={cell.date} className="px-2 py-3 text-center align-top">
                        {!cell.applies ? (
                          <span className="text-xs text-faint">
                            {cell.closed ? "closed" : "—"}
                          </span>
                        ) : (
                          <span
                            className={`tabular inline-flex min-w-10 flex-col rounded-lg px-2 py-1 text-sm font-medium ${
                              cell.coverage === "SHORT"
                                ? "bg-danger-soft text-danger"
                                : cell.coverage === "OVER"
                                  ? "bg-warning-soft text-warning"
                                  : "bg-surface-muted"
                            }`}
                          >
                            {cell.actual}
                            <span className="text-[10px] font-normal opacity-70">
                              of {rule.minimumPeople}
                              {rule.maximumPeople ? `–${rule.maximumPeople}` : "+"}
                            </span>
                            {cell.atRisk > 0 && (
                              <span
                                className="text-[10px] font-normal text-warning"
                                title="Leave asked for on this day but not approved"
                              >
                                −{cell.atRisk} if approved
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.mayManage && data.rules.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            icon="shield"
            title="The rules"
            description="What each one asks for, and on which days"
          />
          <ul className="divide-y divide-border">
            {data.rules.map((rule) => (
              <li key={rule.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {rule.name}
                      {!rule.isActive && (
                        <span className="ml-2">
                          <Badge tone="neutral">Not watched</Badge>
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-faint">
                      {[
                        rule.project?.name ?? "Whole company",
                        rule.department,
                        rule.shift?.name,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <StaffingRuleEditor
                    projects={data.projects}
                    shifts={data.shifts}
                    departments={data.departments}
                    rule={{
                      id: rule.id,
                      name: rule.name,
                      projectId: rule.projectId ?? "",
                      department: rule.department ?? "",
                      shiftId: rule.shiftId ?? "",
                      weekdays: rule.weekdays,
                      minimumPeople: rule.minimumPeople,
                      maximumPeople: rule.maximumPeople ?? 0,
                      isActive: rule.isActive,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
