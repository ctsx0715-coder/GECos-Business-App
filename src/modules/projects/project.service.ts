import { db } from "@/lib/database/client";
import { nextReference } from "@/lib/database/reference-numbers";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import {
  addMemberSchema,
  createExpenseSchema,
  createMilestoneSchema,
  createProjectSchema,
  createTaskSchema,
  decideExpenseSchema,
  projectFromTenderSchema,
  updateProjectSchema,
  updateTaskStatusSchema,
} from "@/schemas/project.schema";
import type { ProjectStatus } from "@/generated/prisma/client";
import { projectRepository } from "./project.repository";

/**
 * Project business logic.
 *
 * Two things carry the weight here: the handoff from a won tender, which keeps
 * the thread from enquiry through to delivery unbroken, and the budget, where
 * approving spend is what commits money rather than paying it.
 */

/**
 * Spend that counts against a budget.
 *
 * APPROVED is included deliberately. A cost someone has signed off is money
 * gone, and a budget that only counts paid invoices tells a project manager
 * they are fine right up until the invoices arrive.
 */
const COMMITTED_STATUSES = ["APPROVED", "PAID"] as const;

export interface BudgetHealth {
  budgetCents: bigint;
  /** Expenses plus approved purchase orders. What the project has promised. */
  committedCents: bigint;
  /** The expenses half of it. */
  expenseCents: bigint;
  /** The purchase-order half, and how many orders it came from. */
  orderedCents: bigint;
  orderCount: number;
  paidCents: bigint;
  pendingCents: bigint;
  remainingCents: bigint;
  percentUsed: number;
  isOverBudget: boolean;
}

export const projectService = {
  async list(status?: ProjectStatus[]) {
    await requirePermission("projects.project.view");
    return projectRepository.list(status);
  },

  async getById(id: string) {
    await requirePermission("projects.project.view");
    const project = await projectRepository.findById(id);
    if (!project) throw new NotFoundError("Project");
    return project;
  },

  async create(input: unknown) {
    await requirePermission("projects.project.create");
    const data = createProjectSchema.parse(input);
    const { userId } = requireRequestContext();

    if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
      throw new BusinessRuleError("The end date is before the start date.");
    }

    return projectRepository.create({
      reference: await nextReference("PRJ"),
      name: data.name,
      description: data.description,
      customerId: data.customerId,
      managerId: data.managerId ?? userId,
      tenderId: data.tenderId,
      opportunityId: data.opportunityId,
      contractValueCents: data.contractValueRands,
      budgetCents: data.budgetRands,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: "PLANNING",
    });
  },

  /**
   * Starts a project from a won tender.
   *
   * The customer, contract value and title all come from the bid, and the
   * project keeps a link back to it. Nobody retypes the client, and the chain
   * from lead to opportunity to tender to delivery stays queryable.
   */
  async createFromTender(input: unknown) {
    await requirePermission("projects.project.create");
    const data = projectFromTenderSchema.parse(input);
    const { userId } = requireRequestContext();

    const tender = await db.tender.findUnique({
      where: { id: data.tenderId },
      include: { opportunities: { select: { id: true }, take: 1 } },
    });
    if (!tender) throw new NotFoundError("Tender");

    if (tender.status !== "WON") {
      throw new BusinessRuleError(
        `Only a won tender becomes a project. ${tender.reference} is currently ` +
          `${tender.status.toLowerCase().replace("_", " ")}.`,
      );
    }
    if (!tender.customerId) {
      throw new BusinessRuleError(
        "This tender has no customer, so there is nobody to deliver for.",
      );
    }

    const existing = await db.project.findFirst({
      where: { tenderId: tender.id },
      select: { id: true, reference: true },
    });
    if (existing) {
      throw new BusinessRuleError(
        `${tender.reference} already has project ${existing.reference}.`,
        { projectId: existing.id },
      );
    }

    return projectRepository.create({
      reference: await nextReference("PRJ"),
      name: data.name ?? tender.title,
      description: tender.description,
      customerId: tender.customerId,
      tenderId: tender.id,
      opportunityId: tender.opportunities[0]?.id,
      managerId: data.managerId ?? userId,
      contractValueCents: tender.awardedValueCents ?? tender.estimatedValueCents,
      budgetCents: data.budgetRands,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: "PLANNING",
    });
  },

  async update(id: string, input: unknown) {
    await requirePermission("projects.project.edit");
    const data = updateProjectSchema.parse(input);

    const project = await projectRepository.findById(id);
    if (!project) throw new NotFoundError("Project");
    if (project.status === "COMPLETED" || project.status === "CANCELLED") {
      throw new BusinessRuleError(
        "This project is closed. Reopen it before making changes.",
      );
    }

    return projectRepository.update(id, {
      name: data.name,
      description: data.description,
      managerId: data.managerId,
      contractValueCents: data.contractValueRands,
      budgetCents: data.budgetRands,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      percentComplete: data.percentComplete,
    });
  },

  async setStatus(id: string, status: ProjectStatus) {
    await requirePermission("projects.project.edit");
    const project = await projectRepository.findById(id);
    if (!project) throw new NotFoundError("Project");
    return projectRepository.update(id, { status });
  },

  /**
   * Closes a project out.
   *
   * Refuses while tasks are still open. Completing a project with outstanding
   * work is how a delivery record becomes fiction, and the count in the error
   * tells the manager exactly what is left.
   */
  async complete(id: string) {
    await requirePermission("projects.project.close");

    const project = await projectRepository.findById(id);
    if (!project) throw new NotFoundError("Project");
    if (project.status === "COMPLETED") {
      throw new BusinessRuleError("This project is already complete.");
    }

    const open = await projectRepository.countOpenTasks(id);
    if (open > 0) {
      throw new BusinessRuleError(
        `${open} task${open === 1 ? " is" : "s are"} still open. Close them ` +
          "or cancel them before completing the project.",
        { openTasks: open },
      );
    }

    return projectRepository.update(id, {
      status: "COMPLETED",
      percentComplete: 100,
      closedAt: new Date(),
    });
  },

  async remove(id: string) {
    await requirePermission("projects.project.delete");
    const project = await projectRepository.findById(id);
    if (!project) throw new NotFoundError("Project");
    return projectRepository.softDelete(id);
  },

  // -------------------------------------------------------------------------
  // Team
  // -------------------------------------------------------------------------

  async addMember(input: unknown) {
    await requirePermission("projects.team.manage");
    const data = addMemberSchema.parse(input);

    const existing = await projectRepository.findMember(
      data.projectId,
      data.userId,
    );
    if (existing) {
      throw new BusinessRuleError("That person is already on this project.");
    }

    return projectRepository.addMember(data);
  },

  // -------------------------------------------------------------------------
  // Tasks and milestones
  // -------------------------------------------------------------------------

  async createTask(input: unknown) {
    await requirePermission("projects.task.manage");
    const data = createTaskSchema.parse(input);
    return projectRepository.createTask(data);
  },

  async setTaskStatus(input: unknown) {
    await requirePermission("projects.task.manage");
    const data = updateTaskStatusSchema.parse(input);

    const task = await projectRepository.findTask(data.taskId);
    if (!task) throw new NotFoundError("Task");

    return projectRepository.updateTask(data.taskId, {
      status: data.status,
      completedAt: data.status === "DONE" ? new Date() : null,
      blockedReason: data.status === "BLOCKED" ? data.blockedReason : null,
    });
  },

  async myTasks() {
    await requirePermission("projects.task.view");
    const { userId } = requireRequestContext();
    if (!userId) return [];
    return projectRepository.tasksFor(userId, ["TODO", "IN_PROGRESS", "BLOCKED"]);
  },

  async createMilestone(input: unknown) {
    await requirePermission("projects.task.manage");
    const data = createMilestoneSchema.parse(input);
    return projectRepository.createMilestone({
      projectId: data.projectId,
      name: data.name,
      description: data.description,
      dueAt: data.dueAt,
      isPaymentMilestone: data.isPaymentMilestone,
      valueCents: data.valueRands,
    });
  },

  // -------------------------------------------------------------------------
  // Expenses and budget
  // -------------------------------------------------------------------------

  async submitExpense(input: unknown) {
    await requirePermission("projects.expense.submit");
    const data = createExpenseSchema.parse(input);
    const { userId } = requireRequestContext();

    const project = await projectRepository.findById(data.projectId);
    if (!project) throw new NotFoundError("Project");
    if (project.status === "COMPLETED" || project.status === "CANCELLED") {
      throw new BusinessRuleError(
        "This project is closed. Costs cannot be booked against it.",
      );
    }

    return projectRepository.createExpense({
      projectId: data.projectId,
      reference: await nextReference("EXP"),
      description: data.description,
      category: data.category,
      amountCents: BigInt(Math.round(data.amountRands * 100)),
      incurredAt: data.incurredAt,
      supplierName: data.supplierName,
      status: "SUBMITTED",
      submittedById: userId,
    });
  },

  /**
   * Approves or rejects a cost.
   *
   * Separation of duties: nobody approves their own spend, however senior.
   * Approval is also the moment the money is committed against the budget, so
   * this is a distinct permission from editing the project.
   */
  async decideExpense(input: unknown) {
    const actorId = await requirePermission("projects.expense.approve");
    const data = decideExpenseSchema.parse(input);

    const expense = await projectRepository.findExpense(data.expenseId);
    if (!expense) throw new NotFoundError("Expense");
    if (expense.status !== "SUBMITTED") {
      throw new BusinessRuleError(
        `This expense is ${expense.status.toLowerCase()} and cannot be decided again.`,
      );
    }
    if (expense.submittedById && expense.submittedById === actorId) {
      throw new ForbiddenError(
        "You cannot approve your own expense. Ask another approver.",
      );
    }

    return projectRepository.updateExpense(data.expenseId, {
      status: data.decision,
      approvedById: actorId,
      approvedAt: new Date(),
      rejectedReason: data.decision === "REJECTED" ? data.reason : null,
    });
  },

  async pendingExpenses() {
    await requirePermission("projects.expense.approve");
    return projectRepository.pendingExpenses();
  },

  /**
   * Budget against committed spend.
   *
   * Computed rather than stored, for the same reason compliance status is
   * (ADR-004): a stored total goes stale the moment an expense changes.
   *
   * An approved purchase order counts here alongside the approved expenses.
   * Both are money the company has promised somebody, and until procurement
   * existed the orders were simply invisible — a budget showing only what has
   * been claimed back tells a manager they are fine right up to the month the
   * suppliers invoice. The purchase orders are read directly rather than
   * through the procurement service on purpose: this figure must not change
   * depending on whether the person looking at the project also holds
   * `procurement.order.view`.
   */
  async budgetHealth(projectId: string): Promise<BudgetHealth> {
    await requirePermission("projects.expense.view");

    const [committed, paid, pending, project, orders] = await Promise.all([
      db.projectExpense.aggregate({
        where: { projectId, status: { in: [...COMMITTED_STATUSES] } },
        _sum: { amountCents: true },
      }),
      db.projectExpense.aggregate({
        where: { projectId, status: "PAID" },
        _sum: { amountCents: true },
      }),
      db.projectExpense.aggregate({
        where: { projectId, status: "SUBMITTED" },
        _sum: { amountCents: true },
      }),
      db.project.findUnique({
        where: { id: projectId },
        select: { budgetCents: true },
      }),
      // Lines rather than a total, because a purchase order stores no total —
      // see the schema for why. CLOSED counts too: an order closed short is
      // still money that went out on the part that arrived.
      db.purchaseOrder.findMany({
        where: { projectId, status: { in: ["APPROVED", "CLOSED"] } },
        select: { id: true, lines: { select: { quantity: true, unitPriceCents: true } } },
      }),
    ]);

    const budgetCents = project?.budgetCents ?? 0n;
    const expenseCents = committed._sum.amountCents ?? 0n;

    // Rounded per line, matching how the order itself is priced, so the figure
    // here and the figure on the purchase order are the same number.
    const orderedCents = orders.reduce(
      (total, order) =>
        total +
        order.lines.reduce(
          (lineTotal, line) =>
            lineTotal +
            BigInt(
              Math.round(Number(line.quantity.toString()) * Number(line.unitPriceCents)),
            ),
          0n,
        ),
      0n,
    );

    const committedCents = expenseCents + orderedCents;
    const remainingCents = budgetCents - committedCents;

    return {
      budgetCents,
      committedCents,
      expenseCents,
      orderedCents,
      orderCount: orders.length,
      paidCents: paid._sum.amountCents ?? 0n,
      pendingCents: pending._sum.amountCents ?? 0n,
      remainingCents,
      percentUsed:
        budgetCents === 0n
          ? 0
          : Math.round((Number(committedCents) / Number(budgetCents)) * 100),
      isOverBudget: budgetCents > 0n && committedCents > budgetCents,
    };
  },
};
