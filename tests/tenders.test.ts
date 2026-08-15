import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { db, rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { ForbiddenError } from "@/lib/errors";
import { tenderService } from "@/modules/tenders/tender.service";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  seedTenderApprovalWorkflow,
  type SeededOrg,
} from "./fixtures";

/**
 * The acceptance criteria from docs/01-demo-scope.md, as tests.
 *
 * Every check runs through the service layer, because that is where the rules
 * live and where a real request would hit them.
 */

let org: SeededOrg;

/** Acts as a given role, the way a signed-in request would. */
function as<T>(user: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[user] },
    fn,
  );
}

const validTender = {
  title: "Bulk water pipeline, Ward 12",
  closingAt: new Date(Date.now() + 30 * 86_400_000),
  estimatedValueRands: 1_250_000,
};

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
});

afterAll(async () => {
  await rawDb.$disconnect();
});

describe("creating tenders", () => {
  it("allocates a sequential per-year reference", async () => {
    const first = await as("tender_officer", () =>
      tenderService.create(validTender),
    );
    const second = await as("tender_officer", () =>
      tenderService.create({ ...validTender, title: "Second" }),
    );

    const year = new Date().getUTCFullYear();
    expect(first.reference).toBe(`TN-${year}-0001`);
    expect(second.reference).toBe(`TN-${year}-0002`);
  });

  it("stores money as integer cents", async () => {
    const tender = await as("tender_officer", () =>
      tenderService.create(validTender),
    );
    expect(tender.estimatedValueCents).toBe(125_000_000n);
  });

  it("seeds the submission checklist", async () => {
    const tender = await as("tender_officer", () =>
      tenderService.create(validTender),
    );
    const checklist = await as("tender_officer", () =>
      tenderService.checklistStatus(tender.id),
    );
    expect(checklist.total).toBeGreaterThan(5);
    expect(checklist.satisfied).toBe(0);
  });

  it("refuses a user without the create permission", async () => {
    await expect(
      as("employee", () => tenderService.create(validTender)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a closing date in the past", async () => {
    await expect(
      as("tender_officer", () =>
        tenderService.create({
          ...validTender,
          closingAt: new Date(Date.now() - 86_400_000),
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("the submission checklist gate", () => {
  async function tenderWithChecklist() {
    const tender = await as("tender_officer", () =>
      tenderService.create(validTender),
    );
    const requirements = await withRequestContext(
      { organisationId: org.organisationId, userId: org.userIds.tender_officer },
      () => db.tenderRequirement.findMany({ where: { tenderId: tender.id } }),
    );
    return { tender, requirements };
  }

  it("blocks submission while mandatory items are outstanding", async () => {
    const { tender } = await tenderWithChecklist();

    await expect(
      as("tender_officer", () => tenderService.submitForApproval(tender.id)),
    ).rejects.toThrow(/mandatory item/);
  });

  it("names what is missing so the user can act on it", async () => {
    const { tender } = await tenderWithChecklist();

    const status = await as("tender_officer", () =>
      tenderService.checklistStatus(tender.id),
    );
    expect(status.canSubmit).toBe(false);
    expect(status.missingMandatory).toContain("Tax compliance status PIN");
  });

  it("allows submission once every mandatory item is satisfied", async () => {
    const { tender, requirements } = await tenderWithChecklist();

    for (const requirement of requirements.filter((r) => r.isMandatory)) {
      await as("tender_officer", () =>
        tenderService.setRequirementSatisfied(requirement.id, true),
      );
    }

    const status = await as("tender_officer", () =>
      tenderService.checklistStatus(tender.id),
    );
    expect(status.canSubmit).toBe(true);

    await seedTenderApprovalWorkflow(org);
    const result = await as("tender_officer", () =>
      tenderService.submitForApproval(tender.id),
    );
    expect(result.tender.status).toBe("PENDING_APPROVAL");
  });

  it("ignores optional items when deciding submittability", async () => {
    const { tender, requirements } = await tenderWithChecklist();
    for (const requirement of requirements.filter((r) => r.isMandatory)) {
      await as("tender_officer", () =>
        tenderService.setRequirementSatisfied(requirement.id, true),
      );
    }
    const status = await as("tender_officer", () =>
      tenderService.checklistStatus(tender.id),
    );
    expect(status.canSubmit).toBe(true);
    expect(status.satisfied).toBeLessThan(status.total);
  });
});

describe("approval and separation of duties", () => {
  async function submittedTender() {
    await seedTenderApprovalWorkflow(org);
    const tender = await as("tender_officer", () =>
      tenderService.create(validTender),
    );
    const requirements = await withRequestContext(
      { organisationId: org.organisationId, userId: org.userIds.tender_officer },
      () => db.tenderRequirement.findMany({ where: { tenderId: tender.id } }),
    );
    for (const requirement of requirements.filter((r) => r.isMandatory)) {
      await as("tender_officer", () =>
        tenderService.setRequirementSatisfied(requirement.id, true),
      );
    }
    const { workflowInstance } = await as("tender_officer", () =>
      tenderService.submitForApproval(tender.id),
    );
    return { tender, instance: workflowInstance! };
  }

  async function pendingApprovalId(instanceId: string) {
    const approval = await withRequestContext(
      { organisationId: org.organisationId, userId: org.userIds.executive },
      () =>
        db.workflowApproval.findFirst({
          where: { workflowInstanceId: instanceId, status: "PENDING" },
          orderBy: { sortOrder: "asc" },
        }),
    );
    return approval!.id;
  }

  it("refuses a user without the approve permission", async () => {
    const { instance } = await submittedTender();
    const approvalId = await pendingApprovalId(instance.id);

    await expect(
      as("employee", () =>
        tenderService.decideApproval({ approvalId, decision: "APPROVED" }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses the tender's own owner even though they could otherwise approve", async () => {
    await seedTenderApprovalWorkflow(org);

    // The officer compiles the bid but hands ownership to the finance manager,
    // who holds tenders.tender.approve. Permission alone would let this
    // through; separation of duties must not.
    const tender = await as("tender_officer", () =>
      tenderService.create({
        ...validTender,
        ownerId: org.userIds.finance_manager,
      }),
    );

    const requirements = await withRequestContext(
      { organisationId: org.organisationId, userId: org.userIds.tender_officer },
      () => db.tenderRequirement.findMany({ where: { tenderId: tender.id } }),
    );
    for (const requirement of requirements.filter((r) => r.isMandatory)) {
      await as("tender_officer", () =>
        tenderService.setRequirementSatisfied(requirement.id, true),
      );
    }
    const { workflowInstance } = await as("tender_officer", () =>
      tenderService.submitForApproval(tender.id),
    );
    const approvalId = await pendingApprovalId(workflowInstance!.id);

    const attempt = as("finance_manager", () =>
      tenderService.decideApproval({ approvalId, decision: "APPROVED" }),
    );

    await expect(attempt).rejects.toThrow(/cannot approve a tender you own/);

    /*
     * The class matters as much as the message. Server actions translate an
     * AppError into a refusal the screen can render, and rethrow anything else
     * to the error boundary. Downgrade this to a plain Error and the rule still
     * holds — but the approver sees a crash page instead of being told why.
     */
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("advances through the chain and only approves at the end", async () => {
    const { tender, instance } = await submittedTender();

    const financeApproval = await pendingApprovalId(instance.id);
    const first = await as("finance_manager", () =>
      tenderService.decideApproval({
        approvalId: financeApproval,
        decision: "APPROVED",
      }),
    );
    expect(first.isFinal).toBe(false);

    const afterFirst = await as("tender_officer", () =>
      tenderService.getById(tender.id),
    );
    expect(afterFirst.status).toBe("PENDING_APPROVAL");

    const execApproval = await pendingApprovalId(instance.id);
    const second = await as("executive", () =>
      tenderService.decideApproval({
        approvalId: execApproval,
        decision: "APPROVED",
      }),
    );
    expect(second.isFinal).toBe(true);

    const afterSecond = await as("tender_officer", () =>
      tenderService.getById(tender.id),
    );
    expect(afterSecond.status).toBe("APPROVED");
  });

  it("closes the chain immediately on rejection", async () => {
    const { instance } = await submittedTender();
    const approvalId = await pendingApprovalId(instance.id);

    const result = await as("finance_manager", () =>
      tenderService.decideApproval({
        approvalId,
        decision: "REJECTED",
        comment: "Margin too thin at this price.",
      }),
    );

    expect(result).toEqual({ instanceStatus: "REJECTED", isFinal: true });

    const remaining = await withRequestContext(
      { organisationId: org.organisationId, userId: org.userIds.executive },
      () =>
        db.workflowApproval.findFirst({
          where: { workflowInstanceId: instance.id, status: "PENDING" },
        }),
    );
    expect(remaining).not.toBeNull();

    await expect(
      as("executive", () =>
        tenderService.decideApproval({
          approvalId: remaining!.id,
          decision: "APPROVED",
        }),
      ),
    ).rejects.toThrow(/already closed/);
  });

  it("refuses to skip ahead in the chain", async () => {
    const { instance } = await submittedTender();
    const execApproval = await withRequestContext(
      { organisationId: org.organisationId, userId: org.userIds.executive },
      () =>
        db.workflowApproval.findFirst({
          where: { workflowInstanceId: instance.id, sortOrder: 1 },
        }),
    );

    await expect(
      as("executive", () =>
        tenderService.decideApproval({
          approvalId: execApproval!.id,
          decision: "APPROVED",
        }),
      ),
    ).rejects.toThrow(/earlier step/);
  });
});

describe("tenant isolation through the service", () => {
  it("will not read another tenant's tender", async () => {
    const tender = await as("tender_officer", () =>
      tenderService.create(validTender),
    );

    const rival = await seedOrganisation("Rival Co");
    await expect(
      withRequestContext(
        {
          organisationId: rival.organisationId,
          userId: rival.userIds.tender_officer,
        },
        () => tenderService.getById(tender.id),
      ),
    ).rejects.toThrow(/not found/i);
  });
});
