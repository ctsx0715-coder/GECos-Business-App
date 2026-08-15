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

export async function updateEmployeeAction(
  employeeId: string,
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.updateEmployee(employeeId, input)),
    () => ({ ok: true, redirectTo: `/hr/employees/${employeeId}` }),
  );
  revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/hr/employees");
  return result;
}

/**
 * Ending someone's employment.
 *
 * Revalidates the leave register too: the service cancels leave booked for
 * after their last day, and a queue still offering those requests for approval
 * would be showing decisions nobody can take.
 */
export async function exitEmployeeAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.exitEmployee(input)),
    () => ({ ok: true }),
  );
  revalidatePath(`/hr/employees/${String(input.employeeId)}`);
  revalidatePath("/hr/employees");
  revalidatePath("/hr/leave");
  return result;
}

export async function addCertificationAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.addCertification(input)),
    () => ({ ok: true }),
  );
  revalidatePath(`/hr/employees/${String(input.employeeId)}`);
  revalidatePath("/compliance");
  revalidatePath("/dashboard");
  return result;
}

export async function removeCertificationAction(
  certificationId: string,
  employeeId: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await hrService.removeCertification({ certificationId });
    }),
  );
  revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/compliance");
  return result;
}

export async function adjustBalanceAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.adjustBalance(input)),
    () => ({ ok: true }),
  );
  revalidatePath(`/hr/employees/${String(input.employeeId)}`);
  return result;
}

export async function createLeaveTypeAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.createLeaveType(input)),
    () => ({ ok: true, redirectTo: "/hr/leave/types" }),
  );
  revalidatePath("/hr/leave/types");
  return result;
}

export async function updateLeaveTypeAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.updateLeaveType(input)),
    () => ({ ok: true, redirectTo: "/hr/leave/types" }),
  );
  revalidatePath("/hr/leave/types");
  return result;
}

/**
 * Running accrual by hand.
 *
 * The schedule is what normally credits leave (.github/workflows/accrue-leave).
 * This exists because a demonstration cannot wait until the first of the month,
 * and because the run is idempotent — pressing it twice does nothing the second
 * time, so there is no harm in it being a button.
 */
export async function runAccrualAction(): Promise<ActionResult> {
  let credited = 0;
  const result = await run(() =>
    withSession(async () => {
      const summary = await hrService.runAccrual();
      credited = summary.daysCredited;
    }),
  );
  revalidatePath("/hr/leave/types");
  revalidatePath("/hr/employees");
  if (!result.ok) return result;
  return {
    ok: true,
    message:
      credited === 0
        ? "Every balance is already up to date."
        : `Credited ${credited} days.`,
  };
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

export async function generateHolidaysAction(
  year: number,
): Promise<ActionResult> {
  let added = 0;
  const result = await run(() =>
    withSession(async () => {
      const summary = await hrService.generateStatutoryHolidays({ year });
      added = summary.added;
    }),
  );
  revalidatePath("/hr/leave/holidays");
  if (!result.ok) return result;
  return {
    ok: true,
    message:
      added === 0
        ? `${year} is already complete.`
        : `Added ${added} ${added === 1 ? "day" : "days"} for ${year}.`,
  };
}

export async function addHolidayAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.addHoliday(input)),
    () => ({ ok: true }),
  );
  revalidatePath("/hr/leave/holidays");
  return result;
}

export async function removeHolidayAction(
  holidayId: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await hrService.removeHoliday({ holidayId });
    }),
  );
  revalidatePath("/hr/leave/holidays");
  return result;
}

export async function createWorkPatternAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.createWorkPattern(input)),
    () => ({ ok: true }),
  );
  revalidatePath("/hr/work-patterns");
  return result;
}

/**
 * Editing a pattern.
 *
 * Revalidates the leave form as well: what a week costs is computed from the
 * pattern, so a form rendered before the change would preview a number the
 * service no longer agrees with.
 */
export async function updateWorkPatternAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.updateWorkPattern(input)),
    () => ({ ok: true }),
  );
  revalidatePath("/hr/work-patterns");
  revalidatePath("/hr/leave/new");
  return result;
}

export async function assignToRosterAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => hrService.assignToRoster(input)),
    () => ({ ok: true }),
  );
  revalidatePath("/hr/roster");
  return result;
}

export async function removeAssignmentAction(
  assignmentId: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await hrService.removeAssignment({ assignmentId });
    }),
  );
  revalidatePath("/hr/roster");
  return result;
}
