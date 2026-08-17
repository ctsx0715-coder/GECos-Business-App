import Link from "next/link";
import { notFound } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { projectService } from "@/modules/projects/project.service";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
} from "@/components/ui";
import { BudgetBar } from "@/components/ui/budget-bar";
import { formatCents, formatCentsCompact, formatDate, formatRelativeDays } from "@/lib/format";
import {
  AddTask,
  CompleteProject,
  ExpenseDecision,
  SubmitExpense,
  TaskRow,
} from "./controls";
import { AddMemberInline, AddMilestoneInline } from "@/components/forms/inline";
import { formChoices } from "../../create-actions";

const TASK_TONES: Record<string, "neutral" | "accent" | "success" | "danger"> = {
  TODO: "neutral",
  IN_PROGRESS: "accent",
  BLOCKED: "danger",
  DONE: "success",
};

const EXPENSE_TONES: Record<string, "neutral" | "warning" | "success" | "danger"> =
  {
    DRAFT: "neutral",
    SUBMITTED: "warning",
    APPROVED: "success",
    PAID: "success",
    REJECTED: "danger",
  };

export default async function ProjectDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const data = await withSession(async (session) => {
    try {
      return {
        project: await projectService.getById(id),
        budget: await projectService.budgetHealth(id),
        session,
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

  if (!data) notFound();
  const { project, budget, session } = data;
  const canManageTeam = session.permissions.has("projects.team.manage");
  const { users } = canManageTeam
    ? await formChoices()
    : { users: [] as Array<{ value: string; label: string }> };

  const openTasks = project.tasks.filter((t) => t.status !== "DONE");
  const canManageTasks = session.permissions.has("projects.task.manage");
  const canApprove = session.permissions.has("projects.expense.approve");
  const canSubmit = session.permissions.has("projects.expense.submit");
  const canClose = session.permissions.has("projects.project.close");
  const closed = project.status === "COMPLETED" || project.status === "CANCELLED";

  return (
    <>
      <div className="mb-4">
        <Link href="/projects" className="text-xs text-muted hover:underline">
          ← Projects
        </Link>
      </div>

      <PageHeader
        title={project.name}
        description={`${project.reference} · ${project.customer.name}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={closed ? "success" : "accent"}>
              {project.status.toLowerCase().replace("_", " ")}
            </Badge>
            {budget.isOverBudget && <Badge tone="danger">Over budget</Badge>}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Budget"
              description="Approved costs and approved purchase orders both count as committed, whether or not they are paid"
            />
            <div className="px-5 py-4">
              <BudgetBar
                budgetCents={budget.budgetCents}
                committedCents={budget.committedCents}
                pendingCents={budget.pendingCents}
              />
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Contract">
                  <span className="tabular">
                    {formatCentsCompact(project.contractValueCents)}
                  </span>
                </Field>
                <Field label="Committed">
                  <span className="tabular">
                    {formatCentsCompact(budget.committedCents)}
                  </span>
                  {budget.orderCount > 0 && (
                    // Split out because "committed" quietly growing by the
                    // value of a purchase order is the sort of change a
                    // project manager should be able to trace to its cause.
                    <span className="mt-0.5 block text-[11px] text-faint">
                      incl. {formatCentsCompact(budget.orderedCents)} on{" "}
                      {budget.orderCount} order
                      {budget.orderCount === 1 ? "" : "s"}
                    </span>
                  )}
                </Field>
                <Field label="Pending">
                  <span className="tabular text-warning">
                    {formatCentsCompact(budget.pendingCents)}
                  </span>
                </Field>
                <Field label="Remaining">
                  <span
                    className={`tabular ${budget.remainingCents < 0n ? "text-danger" : ""}`}
                  >
                    {formatCentsCompact(budget.remainingCents)}
                  </span>
                </Field>
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Tasks"
              description={`${openTasks.length} open of ${project.tasks.length}`}
            />
            {project.tasks.length === 0 ? (
              <EmptyState
                title="No tasks yet"
                description="Break the work down and it will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {project.tasks.map((task) => {
                  const due = formatRelativeDays(task.dueAt);
                  const overdue = task.status !== "DONE" && due.days < 0;
                  return (
                    <li key={task.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`text-sm ${task.status === "DONE" ? "text-muted line-through" : "font-medium"}`}
                          >
                            {task.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {task.assignee
                              ? `${task.assignee.firstName} ${task.assignee.lastName}`
                              : "Unassigned"}
                            {task.dueAt && (
                              <span className={overdue ? "text-danger" : undefined}>
                                {" "}
                                · due {formatDate(task.dueAt)} ({due.label})
                              </span>
                            )}
                          </p>
                          {task.blockedReason && (
                            <p className="mt-1 text-xs text-danger">
                              Blocked: {task.blockedReason}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0">
                          {canManageTasks && !closed ? (
                            <TaskRow
                              projectId={project.id}
                              taskId={task.id}
                              status={task.status}
                            />
                          ) : (
                            <Badge tone={TASK_TONES[task.status] ?? "neutral"}>
                              {task.status.toLowerCase().replace("_", " ")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {canManageTasks && !closed && <AddTask projectId={project.id} />}
          </Card>

          <Card>
            <CardHeader
              title="Costs"
              description={`${project.expenses.length} booked against this project`}
            />
            {project.expenses.length === 0 ? (
              <EmptyState
                title="No costs booked"
                description="Materials, labour and plant hire appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {project.expenses.map((expense) => (
                  <li
                    key={expense.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {expense.description}
                      </span>
                      <span className="block text-xs text-muted">
                        {expense.category.toLowerCase()} ·{" "}
                        {formatDate(expense.incurredAt)}
                        {expense.submittedBy &&
                          ` · ${expense.submittedBy.firstName} ${expense.submittedBy.lastName}`}
                      </span>
                      {expense.rejectedReason && (
                        <span className="block text-xs text-danger">
                          Rejected: {expense.rejectedReason}
                        </span>
                      )}
                    </span>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {formatCents(expense.amountCents)}
                    </span>
                    <Badge tone={EXPENSE_TONES[expense.status] ?? "neutral"}>
                      {expense.status.toLowerCase()}
                    </Badge>
                    {canApprove && expense.status === "SUBMITTED" && (
                      <ExpenseDecision
                        projectId={project.id}
                        expenseId={expense.id}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canSubmit && !closed && <SubmitExpense projectId={project.id} />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="grid gap-4 px-5 py-4">
              <Field label="Client">
                <Link
                  href={`/crm/customers/${project.customer.id}`}
                  className="text-accent hover:underline"
                >
                  {project.customer.name}
                </Link>
              </Field>
              <Field label="Manager">
                {project.manager
                  ? `${project.manager.firstName} ${project.manager.lastName}`
                  : "Unassigned"}
              </Field>
              <Field label="Dates">
                {project.startsAt ? formatDate(project.startsAt) : "—"} →{" "}
                {project.endsAt ? formatDate(project.endsAt) : "—"}
              </Field>
              <Field label="Progress">{project.percentComplete}%</Field>
            </dl>
            {canClose && !closed && (
              <div className="border-t border-border px-5 py-4">
                <CompleteProject projectId={project.id} />
                <p className="mt-2 text-xs text-muted">
                  Refused while tasks are still open.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Where this came from"
              description="One thread from enquiry to delivery"
            />
            <div className="space-y-2 px-5 py-4 text-sm">
              {project.opportunity && (
                <p>
                  <Link
                    href={`/crm/opportunities/${project.opportunity.id}`}
                    className="text-accent hover:underline"
                  >
                    {project.opportunity.reference}
                  </Link>{" "}
                  <span className="text-muted">{project.opportunity.title}</span>
                </p>
              )}
              {project.tender && (
                <p>
                  <Link
                    href={`/tenders/${project.tender.id}`}
                    className="text-accent hover:underline"
                  >
                    {project.tender.reference}
                  </Link>{" "}
                  <span className="text-muted">{project.tender.title}</span>
                </p>
              )}
              {!project.tender && !project.opportunity && (
                <p className="text-xs text-muted">
                  Created directly, not from a bid.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Team"
              description={`${project.members.length} assigned`}
            />
            {project.members.length === 0 ? (
              <EmptyState
                title="Nobody assigned"
                description="People working on this project appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {project.members.map((member) => (
                  <li key={member.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {member.user.firstName} {member.user.lastName}
                      </span>
                      <span className="tabular text-xs text-muted">
                        {member.allocation}%
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {member.role.toLowerCase()} · {member.user.jobTitle}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {canManageTeam && !closed && (
              <AddMemberInline projectId={project.id} users={users} />
            )}
          </Card>

          <Card>
            <CardHeader title="Milestones" />
            {project.milestones.length === 0 ? (
              <EmptyState
                title="No milestones"
                description="Key dates and payment points appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {project.milestones.map((milestone) => (
                  <li key={milestone.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm ${milestone.completedAt ? "text-muted line-through" : "font-medium"}`}
                      >
                        {milestone.name}
                      </span>
                      {milestone.isPaymentMilestone && (
                        <Badge tone="accent">Payment</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {milestone.dueAt ? formatDate(milestone.dueAt) : "No date"}
                      {milestone.valueCents !== null &&
                        ` · ${formatCentsCompact(milestone.valueCents)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {canManageTasks && !closed && (
              <AddMilestoneInline projectId={project.id} />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
