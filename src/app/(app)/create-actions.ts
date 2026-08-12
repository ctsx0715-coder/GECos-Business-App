"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth/session";
import { runFormAction } from "@/lib/forms/run-form-action";
import { crmService } from "@/modules/crm/crm.service";
import { projectService } from "@/modules/projects/project.service";
import { tenderService } from "@/modules/tenders/tender.service";
import type { FormResult } from "@/components/forms";

/**
 * Every creation path in the system, in one file.
 *
 * These do nothing but bind the tenant context, call the service and shape the
 * result for a form. All validation is the service's, using the same Zod
 * schema the form was built from, so a hand-rolled POST that skips these forms
 * hits exactly the same wall.
 */

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export async function createCustomerAction(input: unknown): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => crmService.createCustomer(input)),
    (customer) => ({ ok: true, redirectTo: `/crm/customers/${customer.id}` }),
  );
  revalidatePath("/crm/customers");
  return result;
}

export async function createContactAction(input: unknown): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => crmService.addContact(input)),
  );
  revalidatePath("/crm/customers", "layout");
  return result;
}

export async function createLeadAction(input: unknown): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => crmService.createLead(input)),
    () => ({ ok: true, redirectTo: "/crm/leads" }),
  );
  revalidatePath("/crm/leads");
  revalidatePath("/dashboard");
  return result;
}

export async function createOpportunityAction(
  input: unknown,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => crmService.createOpportunity(input)),
    (opportunity) => ({
      ok: true,
      redirectTo: `/crm/opportunities/${opportunity.id}`,
    }),
  );
  revalidatePath("/crm/pipeline");
  revalidatePath("/dashboard");
  return result;
}

// ---------------------------------------------------------------------------
// Tenders
// ---------------------------------------------------------------------------

export async function createTenderAction(input: unknown): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => tenderService.create(input)),
    (tender) => ({ ok: true, redirectTo: `/tenders/${tender.id}` }),
  );
  revalidatePath("/tenders");
  revalidatePath("/dashboard");
  return result;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProjectAction(input: unknown): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => projectService.create(input)),
    (project) => ({ ok: true, redirectTo: `/projects/${project.id}` }),
  );
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return result;
}

/**
 * The handoff: a won tender becomes a project.
 *
 * Until now this existed only in the service and the seed, which meant the
 * headline behaviour of the whole platform had no button.
 */
export async function createProjectFromTenderAction(
  input: unknown,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => projectService.createFromTender(input)),
    (project) => ({ ok: true, redirectTo: `/projects/${project.id}` }),
  );
  revalidatePath("/projects");
  revalidatePath("/tenders");
  revalidatePath("/dashboard");
  return result;
}

export async function addProjectMemberAction(
  input: unknown,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => projectService.addMember(input)),
  );
  revalidatePath("/projects", "layout");
  return result;
}

export async function createMilestoneAction(input: unknown): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => projectService.createMilestone(input)),
  );
  revalidatePath("/projects", "layout");
  return result;
}

// ---------------------------------------------------------------------------
// Lookups the forms need
// ---------------------------------------------------------------------------

export interface Choice {
  value: string;
  label: string;
}

/** Customers, users and won tenders, for the select boxes. */
export async function formChoices(): Promise<{
  customers: Choice[];
  users: Choice[];
  wonTendersWithoutProject: Choice[];
}> {
  return withSession(async () => {
    const [customers, users, tenders] = await Promise.all([
      crmService.listCustomers(),
      import("@/lib/database/client").then(({ db }) =>
        db.user.findMany({
          where: { isActive: true },
          orderBy: { firstName: "asc" },
          select: { id: true, firstName: true, lastName: true },
        }),
      ),
      import("@/lib/database/client").then(({ db }) =>
        db.tender.findMany({
          where: { status: "WON", projects: { none: {} } },
          orderBy: { outcomeAt: "desc" },
          select: { id: true, reference: true, title: true },
        }),
      ),
    ]);

    return {
      customers: customers.map((c) => ({ value: c.id, label: c.name })),
      users: users.map((u) => ({
        value: u.id,
        label: `${u.firstName} ${u.lastName}`,
      })),
      wonTendersWithoutProject: tenders.map((t) => ({
        value: t.id,
        label: `${t.reference} — ${t.title}`,
      })),
    };
  });
}
