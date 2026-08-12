import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import type { Prisma, ProjectStatus, TaskStatus } from "@/generated/prisma/client";

/** Data access for projects. No rules and no permission checks (ADR-008). */

function tenant() {
  return requireRequestContext().organisationId;
}

export const projectRepository = {
  list(status?: ProjectStatus[]) {
    return db.project.findMany({
      where: status?.length ? { status: { in: status } } : undefined,
      orderBy: [{ status: "asc" }, { endsAt: "asc" }],
      include: {
        customer: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { tasks: true, members: true } },
      },
    });
  },

  findById(id: string) {
    return db.project.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
        tender: { select: { id: true, reference: true, title: true } },
        opportunity: { select: { id: true, reference: true, title: true } },
        members: {
          where: { leftAt: null },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
          },
        },
        milestones: { orderBy: [{ sortOrder: "asc" }, { dueAt: "asc" }] },
        tasks: {
          orderBy: [{ status: "asc" }, { dueAt: "asc" }],
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        expenses: {
          orderBy: { incurredAt: "desc" },
          include: {
            submittedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  },

  create(data: Omit<Prisma.ProjectUncheckedCreateInput, "organisationId">) {
    return db.project.create({ data: { ...data, organisationId: tenant() } });
  },

  update(id: string, data: Prisma.ProjectUncheckedUpdateInput) {
    return db.project.update({ where: { id }, data });
  },

  softDelete(id: string) {
    return db.project.delete({ where: { id } });
  },

  countOpenTasks(projectId: string) {
    return db.projectTask.count({
      where: { projectId, status: { not: "DONE" } },
    });
  },

  createTask(data: Omit<Prisma.ProjectTaskUncheckedCreateInput, "organisationId">) {
    return db.projectTask.create({ data: { ...data, organisationId: tenant() } });
  },

  findTask(id: string) {
    return db.projectTask.findUnique({ where: { id } });
  },

  updateTask(id: string, data: Prisma.ProjectTaskUncheckedUpdateInput) {
    return db.projectTask.update({ where: { id }, data });
  },

  tasksFor(userId: string, status?: TaskStatus[]) {
    return db.projectTask.findMany({
      where: {
        assigneeId: userId,
        ...(status?.length ? { status: { in: status } } : {}),
      },
      orderBy: { dueAt: "asc" },
      include: { project: { select: { id: true, name: true, reference: true } } },
    });
  },

  createMilestone(
    data: Omit<Prisma.ProjectMilestoneUncheckedCreateInput, "organisationId">,
  ) {
    return db.projectMilestone.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  addMember(data: Omit<Prisma.ProjectMemberUncheckedCreateInput, "organisationId">) {
    return db.projectMember.create({ data: { ...data, organisationId: tenant() } });
  },

  findMember(projectId: string, userId: string) {
    return db.projectMember.findFirst({ where: { projectId, userId, leftAt: null } });
  },

  createExpense(
    data: Omit<Prisma.ProjectExpenseUncheckedCreateInput, "organisationId">,
  ) {
    return db.projectExpense.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  findExpense(id: string) {
    return db.projectExpense.findUnique({
      where: { id },
      include: { project: { select: { id: true, name: true, budgetCents: true } } },
    });
  },

  updateExpense(id: string, data: Prisma.ProjectExpenseUncheckedUpdateInput) {
    return db.projectExpense.update({ where: { id }, data });
  },

  pendingExpenses() {
    return db.projectExpense.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { incurredAt: "asc" },
      include: {
        project: { select: { id: true, name: true, reference: true } },
        submittedBy: { select: { firstName: true, lastName: true } },
      },
    });
  },
};
