"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { crmService } from "@/modules/crm/crm.service";
import type { ActionResult } from "../tenders/actions";

/**
 * Server actions for the CRM screens. Bind the tenant context, call the
 * service, translate errors. Every rule they appear to enforce is enforced one
 * layer down (ADR-008).
 */

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

function refreshCrm() {
  revalidatePath("/crm/leads");
  revalidatePath("/crm/pipeline");
  revalidatePath("/crm/customers");
  revalidatePath("/dashboard");
}

export async function qualifyLead(leadId: string): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await crmService.qualifyLead(leadId);
    }),
  );
  refreshCrm();
  return result;
}

export async function disqualifyLead(
  leadId: string,
  reason: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await crmService.disqualifyLead({ leadId, reason });
    }),
  );
  refreshCrm();
  return result;
}

export async function convertLead(input: {
  leadId: string;
  customerId?: string;
  newCustomerName?: string;
  opportunityTitle: string;
}): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await crmService.convertLead(input);
    }),
  );
  refreshCrm();
  return result;
}

export async function advanceStage(
  opportunityId: string,
  stage: "QUALIFIED" | "PROPOSAL" | "NEGOTIATION",
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await crmService.advanceStage({ opportunityId, stage });
    }),
  );
  refreshCrm();
  revalidatePath(`/crm/opportunities/${opportunityId}`);
  return result;
}

export async function closeOpportunity(
  opportunityId: string,
  outcome: "WON" | "LOST",
  lostReason?: string,
): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await crmService.closeOpportunity({ opportunityId, outcome, lostReason });
    }),
  );
  refreshCrm();
  revalidatePath(`/crm/opportunities/${opportunityId}`);
  return result;
}

export async function logActivity(input: {
  entityType: "LEAD" | "CUSTOMER" | "CONTACT" | "OPPORTUNITY" | "TENDER";
  entityId: string;
  type: "CALL" | "EMAIL" | "MEETING" | "NOTE" | "SITE_VISIT";
  subject: string;
  body?: string;
}): Promise<ActionResult> {
  const result = await run(() =>
    withSession(async () => {
      await crmService.logActivity(input);
    }),
  );
  refreshCrm();
  revalidatePath(`/crm/opportunities/${input.entityId}`);
  revalidatePath(`/crm/customers/${input.entityId}`);
  return result;
}
