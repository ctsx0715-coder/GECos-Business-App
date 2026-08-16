"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth/session";
import { runFormAction } from "@/lib/forms/run-form-action";
import { AppError } from "@/lib/errors";
import { workflowService } from "@/modules/workflows/workflow.service";
import type { FormResult } from "@/components/forms";

/**
 * Server actions for the approval chain screen.
 *
 * Every one of these is configuration of the engine rather than a decision
 * made through it: none of them approves anything, and the service refuses
 * them all without `core.workflow.manage`.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function createChainAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => workflowService.createChain(input)),
    () => ({ ok: true }),
  );
  revalidatePath("/approval-chains");
  return result;
}

export async function setChainActiveAction(
  chainId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await workflowService.updateChain({ chainId, isActive });
    }),
  );
  revalidatePath("/approval-chains");
  return result;
}

export async function addStepAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => workflowService.addStep(input)),
    () => ({ ok: true }),
  );
  revalidatePath("/approval-chains");
  return result;
}

export async function removeStepAction(stepId: string): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await workflowService.removeStep({ stepId });
    }),
  );
  revalidatePath("/approval-chains");
  return result;
}

export async function moveStepAction(
  stepId: string,
  direction: "UP" | "DOWN",
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await workflowService.moveStep({ stepId, direction });
    }),
  );
  revalidatePath("/approval-chains");
  return result;
}
