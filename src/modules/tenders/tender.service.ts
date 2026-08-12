import { db } from "@/lib/database/client";
import { nextReference } from "@/lib/database/reference-numbers";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import { decide, startWorkflow } from "@/lib/workflows/engine";
import {
  approvalDecisionSchema,
  createTenderSchema,
  recordOutcomeSchema,
  updateTenderSchema,
} from "@/schemas/tender.schema";
import { tenderRepository, type TenderListFilters } from "./tender.repository";

/**
 * Business logic and permission checks for tenders (ADR-008).
 *
 * Everything that decides whether an action is allowed happens here, because
 * this is the single layer every path goes through — server actions, route
 * handlers and background jobs alike.
 */

/**
 * The default submission checklist.
 *
 * Modelled on what a South African contractor is typically asked for. It is
 * explicitly a starting point: Nopedi's real checklist is an open discovery
 * question, and seeing this list wrong is the fastest way to learn theirs
 * (docs/02-discovery-questions.md).
 */
export const DEFAULT_TENDER_CHECKLIST = [
  { label: "CSD registration report", isMandatory: true },
  { label: "Tax compliance status PIN", isMandatory: true },
  { label: "Company registration (CIPC)", isMandatory: true },
  { label: "B-BBEE certificate or sworn affidavit", isMandatory: true },
  { label: "Proof of insurance", isMandatory: true },
  { label: "Priced bill of quantities", isMandatory: true },
  { label: "Technical proposal", isMandatory: true },
  { label: "Company profile", isMandatory: false },
  { label: "Contactable references", isMandatory: false },
  { label: "Signed bid forms", isMandatory: true },
  { label: "Letter of good standing (COIDA)", isMandatory: true },
] as const;

export interface ChecklistStatus {
  total: number;
  satisfied: number;
  missingMandatory: string[];
  canSubmit: boolean;
}

export const tenderService = {
  async list(filters: TenderListFilters = {}, pagination = {}) {
    await requirePermission("tenders.tender.view");
    return tenderRepository.list(filters, pagination);
  },

  async getById(id: string) {
    await requirePermission("tenders.tender.view");
    const tender = await tenderRepository.findById(id);
    if (!tender) throw new NotFoundError("Tender");
    return tender;
  },

  // `unknown` rather than a shaped type: the schema below is the contract, and
  // a service that validates internally should not also require its caller to
  // have already produced the right shape.
  async create(input: unknown) {
    await requirePermission("tenders.tender.create");
    const data = createTenderSchema.parse(input);
    const { userId } = requireRequestContext();

    const reference = await nextReference("TN");

    const tender = await tenderRepository.create({
      reference,
      title: data.title,
      tenderNumber: data.tenderNumber,
      description: data.description,
      customerId: data.customerId,
      // Whoever creates a tender owns it unless told otherwise.
      ownerId: data.ownerId ?? userId,
      closingAt: data.closingAt,
      estimatedValueCents: data.estimatedValueRands,
      industry: data.industry,
      status: "IDENTIFIED",
    });

    await tenderRepository.createRequirements(
      tender.id,
      DEFAULT_TENDER_CHECKLIST.map((item, index) => ({
        label: item.label,
        isMandatory: item.isMandatory,
        sortOrder: index,
      })),
    );

    return tender;
  },

  async update(id: string, input: unknown) {
    await requirePermission("tenders.tender.edit");
    const data = updateTenderSchema.parse(input);

    const existing = await tenderRepository.findById(id);
    if (!existing) throw new NotFoundError("Tender");

    if (existing.status === "SUBMITTED") {
      throw new BusinessRuleError(
        "This tender has been submitted and can no longer be edited. " +
          "Record its outcome instead.",
      );
    }

    return tenderRepository.update(id, {
      title: data.title,
      tenderNumber: data.tenderNumber,
      description: data.description,
      customerId: data.customerId,
      ownerId: data.ownerId,
      closingAt: data.closingAt,
      estimatedValueCents: data.estimatedValueRands,
      industry: data.industry,
    });
  },

  async remove(id: string) {
    await requirePermission("tenders.tender.delete");
    const existing = await tenderRepository.findById(id);
    if (!existing) throw new NotFoundError("Tender");
    return tenderRepository.softDelete(id);
  },

  /** Which checklist items are outstanding, and whether submission is allowed. */
  async checklistStatus(tenderId: string): Promise<ChecklistStatus> {
    const requirements = await tenderRepository.requirements(tenderId);
    const missingMandatory = requirements
      .filter((item) => item.isMandatory && item.satisfiedAt === null)
      .map((item) => item.label);

    return {
      total: requirements.length,
      satisfied: requirements.filter((item) => item.satisfiedAt !== null).length,
      missingMandatory,
      canSubmit: missingMandatory.length === 0,
    };
  },

  async setRequirementSatisfied(
    requirementId: string,
    satisfied: boolean,
    documentId?: string,
  ) {
    await requirePermission("tenders.tender.edit");
    return tenderRepository.setRequirementSatisfied(
      requirementId,
      satisfied,
      documentId,
    );
  },

  /**
   * Sends a tender into the approval chain.
   *
   * The checklist gate is enforced here rather than in the UI. A disabled
   * button is a courtesy; this is what actually stops an incomplete bid pack
   * going out (acceptance criteria, docs/01-demo-scope.md).
   */
  async submitForApproval(id: string) {
    await requirePermission("tenders.tender.submit_for_approval");

    const tender = await tenderRepository.findById(id);
    if (!tender) throw new NotFoundError("Tender");

    if (tender.status === "PENDING_APPROVAL") {
      throw new BusinessRuleError("This tender is already awaiting approval.");
    }
    if (tender.status === "SUBMITTED") {
      throw new BusinessRuleError("This tender has already been submitted.");
    }

    const checklist = await this.checklistStatus(id);
    if (!checklist.canSubmit) {
      throw new BusinessRuleError(
        `This tender cannot be submitted while ${checklist.missingMandatory.length} ` +
          "mandatory item(s) are outstanding.",
        { missingMandatory: checklist.missingMandatory },
      );
    }

    const instance = await startWorkflow({
      entityType: "TENDER",
      entityId: tender.id,
      triggerEvent: "tender.submitted_for_approval",
      record: {
        estimatedValueCents: tender.estimatedValueCents,
        status: tender.status,
        industry: tender.industry,
      },
    });

    // No configured approval chain means nothing to wait for.
    const status = instance ? "PENDING_APPROVAL" : "APPROVED";
    const updated = await tenderRepository.update(id, { status });

    return { tender: updated, workflowInstance: instance };
  },

  /**
   * Records an approval decision.
   *
   * Separation of duties is enforced here: holding `tenders.tender.approve` is
   * not enough if you are the tender's owner or the person who submitted it.
   */
  async decideApproval(input: unknown) {
    const actorId = await requirePermission("tenders.tender.approve");
    const { approvalId, decision, comment } = approvalDecisionSchema.parse(input);

    const approval = await db.workflowApproval.findUnique({
      where: { id: approvalId },
      include: { instance: true },
    });
    if (!approval) throw new NotFoundError("Approval");

    const tender = await tenderRepository.findById(approval.instance.entityId);
    if (!tender) throw new NotFoundError("Tender");

    const result = await decide({
      approvalId,
      decision,
      comment,
      canDecide: async () => {
        if (tender.ownerId && tender.ownerId === actorId) {
          throw new ForbiddenError(
            "You cannot approve a tender you own. Ask another approver to review it.",
          );
        }
        if (approval.instance.startedById === actorId) {
          throw new ForbiddenError(
            "You cannot approve a tender you submitted for approval.",
          );
        }
      },
    });

    if (result.isFinal) {
      await tenderRepository.update(tender.id, {
        status: result.instanceStatus === "APPROVED" ? "APPROVED" : "IN_PROGRESS",
      });
    }

    return result;
  },

  /** Marks an approved tender as actually lodged with the client. */
  async markSubmitted(id: string) {
    await requirePermission("tenders.tender.submit_for_approval");
    const tender = await tenderRepository.findById(id);
    if (!tender) throw new NotFoundError("Tender");

    if (tender.status !== "APPROVED") {
      throw new BusinessRuleError(
        "Only an approved tender can be marked as submitted.",
      );
    }
    return tenderRepository.update(id, {
      status: "SUBMITTED",
      submittedAt: new Date(),
    });
  },

  async recordOutcome(id: string, input: unknown) {
    await requirePermission("tenders.tender.record_outcome");
    const data = recordOutcomeSchema.parse(input);

    const tender = await tenderRepository.findById(id);
    if (!tender) throw new NotFoundError("Tender");

    return tenderRepository.update(id, {
      status: data.status,
      awardedValueCents: data.awardedValueRands,
      outcomeNotes: data.outcomeNotes,
      outcomeAt: new Date(),
    });
  },
};
