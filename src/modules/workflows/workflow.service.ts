import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import {
  addStepSchema,
  createChainSchema,
  moveStepSchema,
  removeStepSchema,
  updateChainSchema,
} from "@/schemas/workflow.schema";
import { workflowRepository } from "./workflow.repository";

/**
 * Building the approval hierarchy.
 *
 * The engine that runs these chains has existed since the tender module
 * (ADR-006); what did not exist was any way to write one without a
 * deployment. Everything here is configuration of that engine — it starts no
 * workflows and decides no approvals.
 *
 * Reading and writing are separate permissions on purpose. Somebody who can
 * rewrite the chain can approve anything by writing themselves into it, so
 * `core.workflow.manage` is a strictly bigger power than holding any single
 * approval, and the finance manager who wants to see where their step sits
 * should not need it.
 */
export const workflowService = {
  async listChains() {
    await requirePermission("core.workflow.view");
    return workflowRepository.listChains();
  },

  async getChain(id: string) {
    await requirePermission("core.workflow.view");
    const chain = await workflowRepository.findChain(id);
    if (!chain) throw new NotFoundError("Approval chain");
    return chain;
  },

  async approverOptions() {
    await requirePermission("core.workflow.view");
    return {
      roles: await workflowRepository.listRoles(),
      users: await workflowRepository.listUsers(),
    };
  },

  async createChain(input: unknown) {
    await requirePermission("core.workflow.manage");
    const data = createChainSchema.parse(input);

    /*
     * One chain per record type and event, which the database enforces too.
     * Two chains on the same trigger would race: the engine takes the first
     * active one it finds, so the second is a rule somebody wrote and nobody
     * applies.
     */
    const clash = await workflowRepository.findChainByTrigger(
      data.entityType,
      data.triggerEvent,
    );
    if (clash) {
      throw new BusinessRuleError(
        `${clash.name} already runs on ${data.triggerEvent}.`,
      );
    }

    return workflowRepository.createChain({
      name: data.name,
      entityType: data.entityType,
      triggerEvent: data.triggerEvent,
      isActive: true,
    });
  },

  async updateChain(input: unknown) {
    await requirePermission("core.workflow.manage");
    const { chainId, ...changes } = updateChainSchema.parse(input);

    const chain = await workflowRepository.findChain(chainId);
    if (!chain) throw new NotFoundError("Approval chain");

    /*
     * A chain with no steps approves nothing: the engine finds no applicable
     * step and returns null, and the record sails through. Switching one on
     * in that state would be worse than leaving it off, because the screen
     * would say "active".
     */
    if (changes.isActive && chain.steps.length === 0) {
      throw new BusinessRuleError(
        "This chain has no steps, so nothing would be approved. Add a step first.",
      );
    }

    return workflowRepository.updateChain(chainId, changes);
  },

  /** Adds a rung at the bottom of the ladder. */
  async addStep(input: unknown) {
    await requirePermission("core.workflow.manage");
    const data = addStepSchema.parse(input);

    const chain = await workflowRepository.findChain(data.chainId);
    if (!chain) throw new NotFoundError("Approval chain");

    const existing = await workflowRepository.stepsOf(data.chainId);
    if (existing.length >= 10) {
      throw new BusinessRuleError(
        "Ten approvals is already more of a hierarchy than anybody will use.",
      );
    }

    return workflowRepository.createStep({
      workflowDefinitionId: data.chainId,
      sortOrder: existing.length,
      name: data.name,
      approverType: data.approverType,
      approverRoleId: data.approverType === "ROLE" ? data.approverRoleId : null,
      approverUserId: data.approverType === "USER" ? data.approverUserId : null,
      slaHours: data.slaHours ?? null,
      conditionField: data.conditionField || null,
      conditionOperator: data.conditionOperator ?? null,
      conditionValue: data.conditionValue || null,
    });
  },

  /**
   * Removing a step, and closing the gap behind it.
   *
   * The order column is uniquely indexed per chain, so leaving a hole would
   * make the next insert collide. Renumbering keeps the ladder contiguous.
   */
  async removeStep(input: unknown) {
    await requirePermission("core.workflow.manage");
    const { stepId } = removeStepSchema.parse(input);

    const step = await workflowRepository.findStep(stepId);
    if (!step) throw new NotFoundError("Step");

    await workflowRepository.parkStepOrder(stepId, step.workflowDefinitionId);
    await workflowRepository.deleteStep(stepId);
    await this.renumber(step.workflowDefinitionId);
    return { chainId: step.workflowDefinitionId };
  },

  /** Swaps a step with its neighbour, which is how the order is edited. */
  async moveStep(input: unknown) {
    await requirePermission("core.workflow.manage");
    const { stepId, direction } = moveStepSchema.parse(input);

    const step = await workflowRepository.findStep(stepId);
    if (!step) throw new NotFoundError("Step");

    const steps = await workflowRepository.stepsOf(step.workflowDefinitionId);
    const index = steps.findIndex((row) => row.id === stepId);
    const target = direction === "UP" ? index - 1 : index + 1;
    if (target < 0 || target >= steps.length) return { chainId: step.workflowDefinitionId };

    /*
     * Three writes rather than two: the unique index on (chain, order) would
     * reject a straight swap the moment the first row took the other's number.
     * Parking one out of the way first is the price of the constraint, and the
     * constraint is what stops two steps claiming to be third.
     */
    const other = steps[target];
    await workflowRepository.updateStep(step.id, { sortOrder: -1 });
    await workflowRepository.updateStep(other.id, { sortOrder: step.sortOrder });
    await workflowRepository.updateStep(step.id, { sortOrder: other.sortOrder });

    return { chainId: step.workflowDefinitionId };
  },

  async renumber(chainId: string) {
    const steps = await workflowRepository.stepsOf(chainId);
    for (const [index, step] of steps.entries()) {
      if (step.sortOrder === index) continue;
      await workflowRepository.updateStep(step.id, { sortOrder: index });
    }
  },
};
