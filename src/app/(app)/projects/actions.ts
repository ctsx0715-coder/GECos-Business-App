"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { projectService } from "@/modules/projects/project.service";
import type { ActionResult } from "../tenders/actions";

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
    if (error instanceof Error && error.name === "ZodError") {
      return { ok: false, message: "Check the highlighted fields." };
    }
    throw error;
  }
}

function refresh(projectId?: string) {
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function setTaskStatus(
  projectId: string,
  taskId: string,
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE",
  blockedReason?: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await projectService.setTaskStatus({ taskId, status, blockedReason });
    }),
  );
  refresh(projectId);
  return result;
}

export async function addTask(
  projectId: string,
  title: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await projectService.createTask({ projectId, title });
    }),
  );
  refresh(projectId);
  return result;
}

export async function submitExpense(input: {
  projectId: string;
  description: string;
  category: "LABOUR" | "MATERIALS" | "PLANT" | "SUBCONTRACTOR" | "TRANSPORT" | "OTHER";
  amountRands: number;
}): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await projectService.submitExpense(input);
    }),
  );
  refresh(input.projectId);
  return result;
}

export async function decideExpense(
  projectId: string,
  expenseId: string,
  decision: "APPROVED" | "REJECTED",
  reason?: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await projectService.decideExpense({ expenseId, decision, reason });
    }),
  );
  refresh(projectId);
  return result;
}

export async function completeProject(projectId: string): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await projectService.complete(projectId);
    }),
  );
  refresh(projectId);
  return result;
}
