"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { tenderService } from "@/modules/tenders/tender.service";

/**
 * Server actions for the tender screens.
 *
 * These do three things and no more: bind the session's tenant context, call
 * the service, and translate errors into something the page can render. Every
 * rule they appear to enforce is actually enforced in the service, so a
 * hand-rolled request that skips this file hits the same wall (ADR-008).
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        ok: false,
        message: error.message,
        details: "details" in error ? (error.details as never) : undefined,
      };
    }
    throw error;
  }
}

export async function toggleRequirement(
  tenderId: string,
  requirementId: string,
  satisfied: boolean,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await tenderService.setRequirementSatisfied(requirementId, satisfied);
    }),
  );
  revalidatePath(`/tenders/${tenderId}`);
  return result;
}

export async function submitForApproval(
  tenderId: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await tenderService.submitForApproval(tenderId);
    }),
  );
  revalidatePath(`/tenders/${tenderId}`);
  revalidatePath("/tenders");
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  return result;
}

export async function decideApproval(
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  comment?: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await tenderService.decideApproval({ approvalId, decision, comment });
    }),
  );
  revalidatePath("/approvals");
  revalidatePath("/tenders");
  revalidatePath("/dashboard");
  return result;
}

export async function markSubmitted(tenderId: string): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await tenderService.markSubmitted(tenderId);
    }),
  );
  revalidatePath(`/tenders/${tenderId}`);
  revalidatePath("/tenders");
  return result;
}
