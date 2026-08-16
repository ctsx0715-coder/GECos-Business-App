"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth/session";
import { runFormAction } from "@/lib/forms/run-form-action";
import { AppError } from "@/lib/errors";
import { hseService } from "@/modules/hse/hse.service";
import type { FormResult } from "@/components/forms";

/**
 * Server actions for the safety screens.
 *
 * Bind the session's tenant context, call the service, translate errors. Every
 * rule these appear to enforce is enforced in the service, so a hand-rolled
 * request that skips this file hits the same wall (ADR-008).
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

export async function reportIncidentAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hseService.report(input)),
    (incident) => ({ ok: true, redirectTo: `/hse/incidents/${incident.id}` }),
  );
  revalidatePath("/hse/incidents");
  revalidatePath("/hse");
  return result;
}

export async function investigateIncidentAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => hseService.investigate(input)),
  );
  revalidatePath(`/hse/incidents/${String(input.incidentId)}`);
  revalidatePath("/hse");
  return result;
}

export async function recordFilingAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => hseService.recordFiling(input)),
  );
  revalidatePath(`/hse/incidents/${String(input.incidentId)}`);
  revalidatePath("/hse");
  return result;
}

export async function addActionAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => hseService.addAction(input)),
  );
  revalidatePath(`/hse/incidents/${String(input.incidentId)}`);
  revalidatePath("/hse");
  return result;
}

export async function completeActionAction(
  actionId: string,
  completedNote?: string,
): Promise<ActionResult> {
  const result = await run(async () => {
    await withSession(() => hseService.completeAction({ actionId, completedNote }));
  });
  revalidatePath("/hse");
  revalidatePath("/hse/incidents");
  return result;
}

export async function closeIncidentAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => hseService.close(input)),
  );
  revalidatePath(`/hse/incidents/${String(input.incidentId)}`);
  revalidatePath("/hse/incidents");
  revalidatePath("/hse");
  return result;
}
