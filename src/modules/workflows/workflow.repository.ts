import { db, rawDb } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import type { Prisma } from "@/generated/prisma/client";

/** Data access for approval chains. No rules, no permission checks (ADR-008). */

function tenant() {
  return requireRequestContext().organisationId;
}

const STEP_INCLUDE = {
  approverRole: { select: { id: true, name: true } },
  approverUser: { select: { id: true, firstName: true, lastName: true } },
} as const;

/*
 * The soft-delete filter, stated by hand.
 *
 * The tenancy extension rewrites top-level reads, but a Prisma extension does
 * not intercept the nested reads inside an `include` — so a step that was
 * removed still arrives when it is fetched through its chain. Every read of
 * steps here goes through this constant rather than relying on the extension,
 * because a removed approver reappearing in the ladder is exactly the kind of
 * quiet wrong the soft delete was supposed to prevent.
 */
const LIVE_STEPS = {
  where: { deletedAt: null },
  orderBy: { sortOrder: "asc" },
  include: STEP_INCLUDE,
} as const;

export const workflowRepository = {
  listChains() {
    return db.workflowDefinition.findMany({
      orderBy: [{ entityType: "asc" }, { name: "asc" }],
      include: {
        steps: LIVE_STEPS,
        _count: { select: { instances: true } },
      },
    });
  },

  findChain(id: string) {
    return db.workflowDefinition.findUnique({
      where: { id },
      include: { steps: LIVE_STEPS },
    });
  },

  findChainByTrigger(entityType: string, triggerEvent: string) {
    return db.workflowDefinition.findFirst({
      where: {
        entityType: entityType as Prisma.WorkflowDefinitionWhereInput["entityType"],
        triggerEvent,
      },
    });
  },

  createChain(
    data: Omit<Prisma.WorkflowDefinitionUncheckedCreateInput, "organisationId">,
  ) {
    return db.workflowDefinition.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  updateChain(id: string, data: Prisma.WorkflowDefinitionUncheckedUpdateInput) {
    return db.workflowDefinition.update({ where: { id }, data });
  },

  findStep(id: string) {
    return db.workflowStep.findUnique({ where: { id } });
  },

  createStep(
    data: Omit<Prisma.WorkflowStepUncheckedCreateInput, "organisationId">,
  ) {
    return db.workflowStep.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  updateStep(id: string, data: Prisma.WorkflowStepUncheckedUpdateInput) {
    return db.workflowStep.update({ where: { id }, data });
  },

  /**
   * Moves a step out of the numbering before it is deleted.
   *
   * Deletes here are soft (ADR-007), so the row survives — and so does its
   * claim on `(chain, sortOrder)`, which is uniquely indexed. Renumbering the
   * survivors would then collide with a step nobody can see. Parking it below
   * every existing number frees the slot and keeps the row, which is what the
   * soft delete was for.
   *
   * `rawDb` deliberately: the extension filters deleted rows out of reads, so
   * the extended client cannot see the numbers already parked down there. The
   * step was fetched through the tenant-scoped client first, so this write is
   * pinned to a row this tenant owns.
   */
  async parkStepOrder(id: string, chainId: string) {
    const lowest = await rawDb.workflowStep.findFirst({
      where: { workflowDefinitionId: chainId },
      orderBy: { sortOrder: "asc" },
      select: { sortOrder: true },
    });

    return rawDb.workflowStep.update({
      where: { id },
      data: { sortOrder: Math.min(lowest?.sortOrder ?? 0, 0) - 1 },
    });
  },

  deleteStep(id: string) {
    return db.workflowStep.delete({ where: { id } });
  },

  stepsOf(chainId: string) {
    return db.workflowStep.findMany({
      where: { workflowDefinitionId: chainId },
      orderBy: { sortOrder: "asc" },
    });
  },

  /** Roles and people a step can point at. */
  listRoles() {
    return db.role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  },

  listUsers() {
    return db.user.findMany({
      where: { isActive: true },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, jobTitle: true },
    });
  },
};
