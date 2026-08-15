import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { describePattern } from "@/modules/hr/work-patterns";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { WorkPatternEditor, NewWorkPattern } from "./manage";

/**
 * Which days people work.
 *
 * Monday to Friday was assumed everywhere until this existed, and on a
 * construction payroll that is wrong more often than it is right. A pattern
 * here decides what a week of leave costs the person on it, and which days a
 * public holiday actually saves them.
 */

export default async function WorkPatternsPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.leave.configure")) return null;
    return { patterns: await hrService.listWorkPatterns(true) };
  });

  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Work patterns"
        description="The days each person is expected to work, and what leave is charged against"
        action={<NewWorkPattern />}
      />

      <Card>
        <CardHeader
          icon="calendar"
          title="Patterns"
          description="Anybody without a pattern of their own works the default"
        />

        {data.patterns.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No patterns yet"
            description="Until one exists, everybody is assumed to work Monday to Friday — which is what leave is currently charged against."
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.patterns.map((pattern) => (
              <li key={pattern.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {pattern.name}
                      {pattern.isDefault && (
                        <span className="ml-2">
                          <Badge tone="accent">Default</Badge>
                        </span>
                      )}
                      {!pattern.isActive && (
                        <span className="ml-2">
                          <Badge tone="neutral">Retired</Badge>
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-faint">
                      <span className="tabular">{pattern.code}</span>
                      {" · "}
                      {describePattern({
                        cycleDays: pattern.cycleDays,
                        workingDayIndexes: pattern.workingDayIndexes,
                        anchorOn: pattern.anchorOn,
                      })}
                      {" · "}
                      {Number(pattern.hoursPerDay)} hours a day
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm text-muted">
                    {pattern._count.employees}
                    <span className="ml-1 text-xs">
                      {pattern._count.employees === 1 ? "person" : "people"}
                    </span>
                  </span>
                </div>

                <WorkPatternEditor
                  pattern={{
                    id: pattern.id,
                    code: pattern.code,
                    name: pattern.name,
                    description: pattern.description ?? "",
                    cycleDays: pattern.cycleDays,
                    workingDayIndexes: pattern.workingDayIndexes,
                    hoursPerDay: Number(pattern.hoursPerDay),
                    isDefault: pattern.isDefault,
                    isActive: pattern.isActive,
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
