"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth/session";
import { runFormAction } from "@/lib/forms/run-form-action";
import { AppError } from "@/lib/errors";
import { hrService } from "@/modules/hr/hr.service";
import type { FormResult } from "@/components/forms";

/**
 * Server actions for the HR screens.
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

export async function createEmployeeAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.createEmployee(input)),
    (employee) => ({ ok: true, redirectTo: `/hr/employees/${employee.id}` }),
  );
  revalidatePath("/hr/employees");
  return result;
}

export async function requestLeaveAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.requestLeave(input)),
    () => ({ ok: true, redirectTo: "/hr/leave" }),
  );
  revalidatePath("/hr/leave");
  return result;
}

export async function decideLeaveAction(
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  comment?: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await hrService.decideLeave({ requestId, decision, comment });
    }),
  );
  revalidatePath("/hr/leave");
  revalidatePath("/dashboard");
  return result;
}

export async function cancelLeaveAction(
  requestId: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await hrService.cancelLeave({ requestId });
    }),
  );
  revalidatePath("/hr/leave");
  return result;
}
