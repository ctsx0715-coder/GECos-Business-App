import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type {
  ConditionOperator,
  EntityType,
  WorkflowStep,
} from "@/generated/prisma/client";

/**
 * The approval engine (ADR-006).
 *
 * Deliberately narrow: linear ordered steps, conditions limited to scalar
 * comparisons against the triggering record, approvers resolved by role, by
 * the requester's manager, or by named user. No branching, no parallel
 * gateways, no loops.
 *
 * That covers every workflow in the brief. A general workflow engine is where
 * projects of this shape overrun, so anything beyond this is a later decision
 * driven by a paying requirement rather than by imagination.
 */

type TriggerRecord = Record<string, unknown>;

/** Evaluates one step's condition against the record that triggered it. */
export function stepApplies(step: WorkflowStep, record: TriggerRecord): boolean {
  if (!step.conditionField || !step.conditionOperator) return true;

  const actual = record[step.conditionField];
  if (actual === undefined || actual === null) return false;

  const expectedRaw = step.conditionValue ?? "";

  // Numbers (including BigInt cents) compare numerically; everything else
  // compares as a string, which is all EQ/NEQ needs.
  const numericActual =
    typeof actual === "bigint"
      ? Number(actual)
      : typeof actual === "number"
        ? actual
        : Number.NaN;
  const numericExpected = Number(expectedRaw);
  const bothNumeric =
    !Number.isNaN(numericActual) && !Number.isNaN(numericExpected);

  const operator: ConditionOperator = step.conditionOperator;

  if (bothNumeric) {
    switch (operator) {
      case "EQ":
        return numericActual === numericExpected;
      case "NEQ":
        return numericActual !== numericExpected;
      case "GT":
        return numericActual > numericExpected;
      case "GTE":
        return numericActual >= numericExpected;
      case "LT":
        return numericActual < numericExpected;
      case "LTE":
        return numericActual <= numericExpected;
    }
  }

  const stringActual = String(actual);
  switch (operator) {
    case "EQ":
      return stringActual === expectedRaw;
    case "NEQ":
      return stringActual !== expectedRaw;
    default:
      // Ordering comparisons on non-numeric values are meaningless. Failing
      // closed is safer than inventing a lexicographic answer.
      return false;
  }
}

async function resolveApprover(
  step: WorkflowStep,
  requesterId: string | null,
): Promise<{ userId?: string; roleId?: string }> {
  switch (step.approverType) {
    case "USER":
      return { userId: step.approverUserId ?? undefined };
    case "ROLE":
      return { roleId: step.approverRoleId ?? undefined };
    case "MANAGER": {
      if (!requesterId) return {};
      const requester = await db.user.findUnique({
        where: { id: requesterId },
        select: { managerId: true },
      });
      return { userId: requester?.managerId ?? undefined };
    }
  }
}

/**
 * Starts a workflow for one record, if the tenant has a definition for this
 * trigger. Returns null when there is no definition — an unconfigured approval
 * is not an error, it just means the action completes immediately.
 */
export async function startWorkflow(params: {
  entityType: EntityType;
  entityId: string;
  triggerEvent: string;
  record: TriggerRecord;
}) {
  const { organisationId, userId } = requireRequestContext();

  const definition = await db.workflowDefinition.findFirst({
    where: {
      entityType: params.entityType,
      triggerEvent: params.triggerEvent,
      isActive: true,
    },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });

  if (!definition) return null;

  const applicable = definition.steps.filter((step) =>
    stepApplies(step, params.record),
  );
  if (applicable.length === 0) return null;

  const instance = await db.workflowInstance.create({
    data: {
      organisationId,
      workflowDefinitionId: definition.id,
      entityType: params.entityType,
      entityId: params.entityId,
      status: "PENDING",
      currentStepOrder: 0,
      startedById: userId,
    },
  });

  // Every step's approval row is created up front so the whole chain is
  // visible to the requester from the moment they submit. Only the first is
  // actionable; the rest wait their turn.
  for (const [index, step] of applicable.entries()) {
    const approver = await resolveApprover(step, userId);
    const dueAt = step.slaHours
      ? new Date(Date.now() + step.slaHours * 3600_000)
      : null;

    await db.workflowApproval.create({
      data: {
        organisationId,
        workflowInstanceId: instance.id,
        workflowStepId: step.id,
        sortOrder: index,
        status: "PENDING",
        assignedToUserId: approver.userId ?? null,
        assignedToRoleId: approver.roleId ?? null,
        dueAt,
      },
    });
  }

  return instance;
}

/** The approval currently awaiting a decision, or null if the chain is done. */
export async function currentApproval(instanceId: string) {
  return db.workflowApproval.findFirst({
    where: { workflowInstanceId: instanceId, status: "PENDING" },
    orderBy: { sortOrder: "asc" },
  });
}

export interface DecisionResult {
  instanceStatus: "PENDING" | "APPROVED" | "REJECTED";
  /** True when this decision completed the whole chain. */
  isFinal: boolean;
}

/**
 * Records one approver's decision and advances the chain.
 *
 * `canDecide` is supplied by the calling service rather than checked here, so
 * that domain rules such as "an approver may not approve their own tender"
 * stay with the domain instead of leaking into the engine.
 */
export async function decide(params: {
  approvalId: string;
  decision: "APPROVED" | "REJECTED";
  comment?: string;
  canDecide?: (approval: { assignedToUserId: string | null }) => Promise<void>;
}): Promise<DecisionResult> {
  const { userId } = requireRequestContext();

  const approval = await db.workflowApproval.findUnique({
    where: { id: params.approvalId },
    include: { instance: true },
  });
  if (!approval) throw new NotFoundError("Approval");

  if (approval.status !== "PENDING") {
    throw new BusinessRuleError("That approval has already been decided.");
  }
  if (approval.instance.status !== "PENDING") {
    throw new BusinessRuleError("That approval chain is already closed.");
  }

  const awaiting = await currentApproval(approval.workflowInstanceId);
  if (awaiting && awaiting.id !== approval.id) {
    throw new BusinessRuleError(
      "An earlier step in this approval chain is still outstanding.",
    );
  }

  if (approval.assignedToUserId && approval.assignedToUserId !== userId) {
    throw new ForbiddenError("That approval is assigned to someone else.");
  }

  await params.canDecide?.(approval);

  await db.workflowApproval.update({
    where: { id: approval.id },
    data: {
      status: params.decision,
      decidedByUserId: userId,
      decidedAt: new Date(),
      comment: params.comment,
    },
  });

  if (params.decision === "REJECTED") {
    await db.workflowInstance.update({
      where: { id: approval.workflowInstanceId },
      data: { status: "REJECTED", completedAt: new Date() },
    });
    return { instanceStatus: "REJECTED", isFinal: true };
  }

  const next = await currentApproval(approval.workflowInstanceId);
  if (next) {
    await db.workflowInstance.update({
      where: { id: approval.workflowInstanceId },
      data: { currentStepOrder: next.sortOrder },
    });
    return { instanceStatus: "PENDING", isFinal: false };
  }

  await db.workflowInstance.update({
    where: { id: approval.workflowInstanceId },
    data: { status: "APPROVED", completedAt: new Date() },
  });
  return { instanceStatus: "APPROVED", isFinal: true };
}
