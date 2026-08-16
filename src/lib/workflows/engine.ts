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
  managerUserId?: string | null,
): Promise<{ userId?: string; roleId?: string }> {
  switch (step.approverType) {
    case "USER":
      return { userId: step.approverUserId ?? undefined };
    case "ROLE":
      return { roleId: step.approverRoleId ?? undefined };
    case "MANAGER": {
      /*
       * The caller may know better who "the manager" is. Leave is the case
       * that forced this: the request is about an employee, who often has no
       * login at all, and whose manager is recorded on the employee record
       * rather than on whichever user typed the request in. Resolving it from
       * the acting user would send a boilermaker's leave to the HR manager's
       * manager, which is nobody's idea of the reporting line.
       */
      if (managerUserId !== undefined) return { userId: managerUserId ?? undefined };
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
  /**
   * Who a MANAGER step means, when the calling service knows. Omitted falls
   * back to the acting user's manager; explicit null means there is nobody,
   * and the step goes to whoever holds the domain permission.
   */
  managerUserId?: string | null;
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
    const approver = await resolveApprover(step, userId, params.managerUserId);
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

/**
 * The approval one record is waiting on, or null when it is waiting on none.
 *
 * A service calls this to find out whether its own permission check is the
 * whole story. Null means no chain was configured for the trigger, or the
 * chain has already finished — both of which leave the decision where it was
 * before approvals existed.
 */
export async function pendingApprovalFor(
  entityType: EntityType,
  entityId: string,
) {
  const instance = await db.workflowInstance.findFirst({
    where: { entityType, entityId, status: "PENDING" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedById: true },
  });
  if (!instance) return null;

  const approval = await currentApproval(instance.id);
  if (!approval) return null;

  return { ...approval, instanceStartedById: instance.startedById };
}

/**
 * Every rung of a record's chain, decided and undecided, in order.
 *
 * The whole ladder rather than the current step, because the requester is owed
 * the answer to "who else has to see this before I know" — and a screen that
 * only ever shows the next name makes an approval look like a queue of one.
 */
export async function approvalTrailFor(
  entityType: EntityType,
  entityId: string,
) {
  const instance = await db.workflowInstance.findFirst({
    where: { entityType, entityId },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true },
  });
  if (!instance) return null;

  const approvals = await db.workflowApproval.findMany({
    where: { workflowInstanceId: instance.id },
    orderBy: { sortOrder: "asc" },
    include: {
      step: { select: { name: true, approverType: true } },
      assignedToUser: { select: { firstName: true, lastName: true } },
      assignedToRole: { select: { name: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return { status: instance.status, approvals };
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

  /*
   * A step assigned to a role means whoever holds that job, and nobody else.
   *
   * Until this check existed the role was decoration: the engine only enforced
   * a named user, so any holder of the domain permission could sign off a step
   * addressed to the Finance Manager — which makes "not everyone can approve
   * this" a claim the software did not keep. Somebody senior who disagrees with
   * the chain can change the chain; that is what the screen is for, and it
   * leaves a record.
   */
  if (approval.assignedToRoleId) {
    const holdsRole = await db.userRole.findFirst({
      where: { userId: userId ?? "", roleId: approval.assignedToRoleId },
      select: { userId: true },
    });
    if (!holdsRole) {
      throw new ForbiddenError("That approval is assigned to another role.");
    }
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
