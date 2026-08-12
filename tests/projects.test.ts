import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { ForbiddenError } from "@/lib/errors";
import { crmService } from "@/modules/crm/crm.service";
import { projectService } from "@/modules/projects/project.service";
import { projectBudgets, projectPortfolio } from "@/lib/analytics/metrics";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * Project rules, weighted towards the budget.
 *
 * Budget arithmetic is the part a project manager will trust or not, so most
 * of these tests are about when money counts as committed rather than about
 * CRUD.
 */

let org: SeededOrg;
let customerId: string;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
  const customer = await as("executive", () =>
    crmService.createCustomer({ name: "City of Tshwane" }),
  );
  customerId = customer.id;
});

afterAll(async () => {
  await rawDb.$disconnect();
});

function aProject(budgetRands = 1_000_000) {
  return as("project_manager", () =>
    projectService.create({
      name: "Reservoir refurbishment",
      customerId,
      budgetRands,
      contractValueRands: budgetRands * 1.25,
    }),
  );
}

describe("creating projects", () => {
  it("allocates a reference and starts in planning", async () => {
    const project = await aProject();
    const year = new Date().getUTCFullYear();
    expect(project.reference).toBe(`PRJ-${year}-0001`);
    expect(project.status).toBe("PLANNING");
  });

  it("refuses a user without the create permission", async () => {
    await expect(
      as("employee", () =>
        projectService.create({ name: "Not allowed", customerId }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an end date before the start date", async () => {
    await expect(
      as("project_manager", () =>
        projectService.create({
          name: "Backwards",
          customerId,
          startsAt: new Date("2026-06-01"),
          endsAt: new Date("2026-05-01"),
        }),
      ),
    ).rejects.toThrow(/end date is before/);
  });
});

describe("starting a project from a won tender", () => {
  async function aTender(status: "WON" | "SUBMITTED") {
    return as("executive", () =>
      db.tender.create({
        data: {
          organisationId: org.organisationId,
          reference: `TN-${Math.floor(Math.random() * 100000)}`,
          title: "Bulk water pipeline",
          customerId,
          closingAt: new Date(Date.now() + 86_400_000),
          estimatedValueCents: 5_000_000_00n,
          awardedValueCents: status === "WON" ? 4_800_000_00n : null,
          status,
        },
      }),
    );
  }

  it("carries the customer, value and title across", async () => {
    const tender = await aTender("WON");

    const project = await as("project_manager", () =>
      projectService.createFromTender({ tenderId: tender.id, budgetRands: 3_900_000 }),
    );

    expect(project.customerId).toBe(customerId);
    expect(project.tenderId).toBe(tender.id);
    expect(project.name).toBe("Bulk water pipeline");
    // The awarded value, not the estimate.
    expect(project.contractValueCents).toBe(4_800_000_00n);
    expect(project.budgetCents).toBe(390_000_000n);
  });

  it("refuses a tender that has not been won", async () => {
    const tender = await aTender("SUBMITTED");
    await expect(
      as("project_manager", () =>
        projectService.createFromTender({ tenderId: tender.id }),
      ),
    ).rejects.toThrow(/Only a won tender/);
  });

  it("refuses to create a second project for the same tender", async () => {
    const tender = await aTender("WON");
    await as("project_manager", () =>
      projectService.createFromTender({ tenderId: tender.id }),
    );

    await expect(
      as("project_manager", () =>
        projectService.createFromTender({ tenderId: tender.id }),
      ),
    ).rejects.toThrow(/already has project/);
  });
});

describe("budget and expenses", () => {
  it("counts approved spend against the budget, not submitted spend", async () => {
    const project = await aProject(1_000_000);

    const expense = await as("employee", () =>
      projectService.submitExpense({
        projectId: project.id,
        description: "Pipe delivery",
        category: "MATERIALS",
        amountRands: 250_000,
      }),
    );

    // Submitted only: pending, not yet committed.
    let health = await as("project_manager", () =>
      projectService.budgetHealth(project.id),
    );
    expect(health.committedCents).toBe(0n);
    expect(health.pendingCents).toBe(25_000_000n);
    expect(health.percentUsed).toBe(0);

    await as("project_manager", () =>
      projectService.decideExpense({
        expenseId: expense.id,
        decision: "APPROVED",
      }),
    );

    // Approved: committed, even though nothing has been paid.
    health = await as("project_manager", () =>
      projectService.budgetHealth(project.id),
    );
    expect(health.committedCents).toBe(25_000_000n);
    expect(health.paidCents).toBe(0n);
    expect(health.percentUsed).toBe(25);
    expect(health.remainingCents).toBe(75_000_000n);
    expect(health.isOverBudget).toBe(false);
  });

  it("flags a project that has gone over budget", async () => {
    const project = await aProject(100_000);

    const expense = await as("employee", () =>
      projectService.submitExpense({
        projectId: project.id,
        description: "Emergency plant hire",
        category: "PLANT",
        amountRands: 140_000,
      }),
    );
    await as("project_manager", () =>
      projectService.decideExpense({
        expenseId: expense.id,
        decision: "APPROVED",
      }),
    );

    const health = await as("project_manager", () =>
      projectService.budgetHealth(project.id),
    );
    expect(health.isOverBudget).toBe(true);
    expect(health.percentUsed).toBe(140);
    expect(health.remainingCents).toBe(-4_000_000n);
  });

  it("excludes a rejected expense from the budget entirely", async () => {
    const project = await aProject(1_000_000);
    const expense = await as("employee", () =>
      projectService.submitExpense({
        projectId: project.id,
        description: "Disputed invoice",
        amountRands: 90_000,
      }),
    );

    await as("project_manager", () =>
      projectService.decideExpense({
        expenseId: expense.id,
        decision: "REJECTED",
        reason: "Not on this project.",
      }),
    );

    const health = await as("project_manager", () =>
      projectService.budgetHealth(project.id),
    );
    expect(health.committedCents).toBe(0n);
    expect(health.pendingCents).toBe(0n);
  });

  it("requires a reason to reject", async () => {
    const project = await aProject();
    const expense = await as("employee", () =>
      projectService.submitExpense({
        projectId: project.id,
        description: "Something",
        amountRands: 1_000,
      }),
    );

    await expect(
      as("project_manager", () =>
        projectService.decideExpense({
          expenseId: expense.id,
          decision: "REJECTED",
        }),
      ),
    ).rejects.toThrow();
  });

  it("refuses to let anyone approve their own expense", async () => {
    const project = await aProject();

    // The project manager both submits and holds the approve permission.
    const expense = await as("project_manager", () =>
      projectService.submitExpense({
        projectId: project.id,
        description: "My own claim",
        amountRands: 5_000,
      }),
    );

    await expect(
      as("project_manager", () =>
        projectService.decideExpense({
          expenseId: expense.id,
          decision: "APPROVED",
        }),
      ),
    ).rejects.toThrow(/cannot approve your own expense/);
  });

  it("refuses to decide the same expense twice", async () => {
    const project = await aProject();
    const expense = await as("employee", () =>
      projectService.submitExpense({
        projectId: project.id,
        description: "Once only",
        amountRands: 2_000,
      }),
    );
    await as("project_manager", () =>
      projectService.decideExpense({ expenseId: expense.id, decision: "APPROVED" }),
    );

    await expect(
      as("project_manager", () =>
        projectService.decideExpense({
          expenseId: expense.id,
          decision: "REJECTED",
          reason: "Changed my mind",
        }),
      ),
    ).rejects.toThrow(/cannot be decided again/);
  });

  it("refuses to book costs against a closed project", async () => {
    const project = await aProject();
    await as("project_manager", () => projectService.complete(project.id));

    await expect(
      as("employee", () =>
        projectService.submitExpense({
          projectId: project.id,
          description: "Late claim",
          amountRands: 1_000,
        }),
      ),
    ).rejects.toThrow(/closed/);
  });
});

describe("tasks and completion", () => {
  it("requires a reason when a task is blocked", async () => {
    const project = await aProject();
    const task = await as("project_manager", () =>
      projectService.createTask({ projectId: project.id, title: "Order pipe" }),
    );

    await expect(
      as("project_manager", () =>
        projectService.setTaskStatus({ taskId: task.id, status: "BLOCKED" }),
      ),
    ).rejects.toThrow();

    const blocked = await as("project_manager", () =>
      projectService.setTaskStatus({
        taskId: task.id,
        status: "BLOCKED",
        blockedReason: "Supplier has no stock until March.",
      }),
    );
    expect(blocked.blockedReason).toMatch(/no stock/);
  });

  it("stamps the completion date and clears it on reopen", async () => {
    const project = await aProject();
    const task = await as("project_manager", () =>
      projectService.createTask({ projectId: project.id, title: "Survey site" }),
    );

    const done = await as("project_manager", () =>
      projectService.setTaskStatus({ taskId: task.id, status: "DONE" }),
    );
    expect(done.completedAt).toBeInstanceOf(Date);

    const reopened = await as("project_manager", () =>
      projectService.setTaskStatus({ taskId: task.id, status: "IN_PROGRESS" }),
    );
    expect(reopened.completedAt).toBeNull();
  });

  it("refuses to complete a project with open tasks", async () => {
    const project = await aProject();
    await as("project_manager", () =>
      projectService.createTask({ projectId: project.id, title: "Outstanding" }),
    );

    await expect(
      as("project_manager", () => projectService.complete(project.id)),
    ).rejects.toThrow(/still open/);
  });

  it("completes once every task is done", async () => {
    const project = await aProject();
    const task = await as("project_manager", () =>
      projectService.createTask({ projectId: project.id, title: "Last one" }),
    );
    await as("project_manager", () =>
      projectService.setTaskStatus({ taskId: task.id, status: "DONE" }),
    );

    const completed = await as("project_manager", () =>
      projectService.complete(project.id),
    );
    expect(completed.status).toBe("COMPLETED");
    expect(completed.percentComplete).toBe(100);
    expect(completed.closedAt).toBeInstanceOf(Date);
  });

  it("shows a person only their own outstanding tasks", async () => {
    const project = await aProject();
    await as("project_manager", () =>
      projectService.createTask({
        projectId: project.id,
        title: "Mine",
        assigneeId: org.userIds.employee,
      }),
    );
    await as("project_manager", () =>
      projectService.createTask({
        projectId: project.id,
        title: "Someone else's",
        assigneeId: org.userIds.project_manager,
      }),
    );

    const mine = await as("employee", () => projectService.myTasks());
    expect(mine.map((t) => t.title)).toEqual(["Mine"]);
  });
});

describe("portfolio metrics", () => {
  it("rolls budget and committed spend across live projects", async () => {
    const a = await aProject(1_000_000);
    const b = await aProject(500_000);

    for (const [project, amount] of [
      [a, 300_000],
      [b, 600_000],
    ] as const) {
      const expense = await as("employee", () =>
        projectService.submitExpense({
          projectId: project.id,
          description: "Works",
          amountRands: amount,
        }),
      );
      await as("project_manager", () =>
        projectService.decideExpense({
          expenseId: expense.id,
          decision: "APPROVED",
        }),
      );
    }

    const portfolio = await as("project_manager", () => projectPortfolio());
    expect(portfolio.activeProjects).toBe(2);
    expect(portfolio.budgetCents).toBe(150_000_000n);
    expect(portfolio.committedCents).toBe(90_000_000n);
    // Only b is over: 600k spent against a 500k budget.
    expect(portfolio.overBudgetCount).toBe(1);

    const budgets = await as("project_manager", () => projectBudgets());
    const overrun = budgets.find((row) => row.id === b.id);
    expect(overrun?.isOverBudget).toBe(true);
    expect(overrun?.percentUsed).toBe(120);
  });

  it("counts overdue and blocked tasks", async () => {
    const project = await aProject();
    await as("project_manager", () =>
      projectService.createTask({
        projectId: project.id,
        title: "Late",
        dueAt: new Date(Date.now() - 3 * 86_400_000),
      }),
    );
    const blocked = await as("project_manager", () =>
      projectService.createTask({ projectId: project.id, title: "Stuck" }),
    );
    await as("project_manager", () =>
      projectService.setTaskStatus({
        taskId: blocked.id,
        status: "BLOCKED",
        blockedReason: "Waiting on the client.",
      }),
    );

    const portfolio = await as("project_manager", () => projectPortfolio());
    expect(portfolio.overdueTasks).toBe(1);
    expect(portfolio.blockedTasks).toBe(1);
  });
});

describe("tenant isolation", () => {
  it("keeps projects apart", async () => {
    await aProject();

    const rival = await seedOrganisation("Kgosi Civils");
    const seen = await withRequestContext(
      {
        organisationId: rival.organisationId,
        userId: rival.userIds.project_manager,
      },
      async () => ({
        projects: await projectService.list(),
        portfolio: await projectPortfolio(),
      }),
    );

    expect(seen.projects).toEqual([]);
    expect(seen.portfolio.activeProjects).toBe(0);
    expect(seen.portfolio.budgetCents).toBe(0n);
  });
});
