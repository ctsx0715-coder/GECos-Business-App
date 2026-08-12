import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import { projectBudgets, projectPortfolio } from "@/lib/analytics/metrics";
import { projectService } from "@/modules/projects/project.service";
import { Badge, Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { BudgetBar } from "@/components/ui/budget-bar";
import { formatCentsCompact, formatDate } from "@/lib/format";

const STATUS_TONES: Record<string, "neutral" | "accent" | "success" | "warning"> =
  {
    PLANNING: "neutral",
    ACTIVE: "accent",
    ON_HOLD: "warning",
    COMPLETED: "success",
    CANCELLED: "neutral",
  };

export default async function ProjectsPage() {
  const { budgets, portfolio, all } = await withSession(async () => ({
    budgets: await projectBudgets(),
    portfolio: await projectPortfolio(),
    all: await projectService.list(),
  }));

  const byId = new Map(all.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader
        title="Projects"
        description="Delivery, budget and what is running late"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Active projects"
          value={String(portfolio.activeProjects)}
          hint={`${formatCentsCompact(portfolio.contractValueCents)} contracted`}
        />
        <StatTile
          label="Committed spend"
          value={formatCentsCompact(portfolio.committedCents)}
          hint={`of ${formatCentsCompact(portfolio.budgetCents)} budgeted`}
        />
        <StatTile
          label="Over budget"
          value={String(portfolio.overBudgetCount)}
          hint="Projects past their allowance"
          tone={portfolio.overBudgetCount > 0 ? "danger" : "success"}
        />
        <StatTile
          label="Overdue tasks"
          value={String(portfolio.overdueTasks)}
          hint={`${portfolio.blockedTasks} blocked`}
          tone={portfolio.overdueTasks > 0 ? "warning" : "default"}
        />
      </div>

      {budgets.length === 0 ? (
        <Card>
          <EmptyState
            title="No live projects"
            description="Win a tender and start a project from it, and it will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {budgets.map((row) => {
            const project = byId.get(row.id);
            return (
              <Card key={row.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="tabular text-xs text-muted">
                        {row.reference}
                      </span>
                      <Badge tone={STATUS_TONES[row.status] ?? "neutral"}>
                        {row.status.toLowerCase().replace("_", " ")}
                      </Badge>
                      {row.isOverBudget && <Badge tone="danger">Over budget</Badge>}
                    </div>
                    <Link
                      href={`/projects/${row.id}`}
                      className="mt-1 block text-sm font-semibold hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      {row.customerName}
                      {project?.manager &&
                        ` · ${project.manager.firstName} ${project.manager.lastName}`}
                      {project?.endsAt && ` · due ${formatDate(project.endsAt)}`}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-muted">
                      Contract
                    </p>
                    <p className="tabular text-lg font-semibold">
                      {formatCentsCompact(row.contractValueCents)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-muted">
                      Budget
                    </p>
                    <BudgetBar
                      budgetCents={row.budgetCents}
                      committedCents={row.committedCents}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-muted">
                      Progress
                    </p>
                    <div className="mb-1.5 flex items-baseline justify-between text-xs">
                      <span className="text-muted">
                        {project?._count.tasks ?? 0} tasks ·{" "}
                        {project?._count.members ?? 0} on team
                      </span>
                      <span className="tabular font-medium">
                        {row.percentComplete}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full bg-success"
                        style={{ width: `${row.percentComplete}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
