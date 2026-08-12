import { nextReference } from "@/lib/database/reference-numbers";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import {
  advanceStageSchema,
  closeOpportunitySchema,
  convertLeadSchema,
  createContactSchema,
  createCustomerSchema,
  createLeadSchema,
  createOpportunitySchema,
  disqualifyLeadSchema,
  logActivitySchema,
  updateOpportunitySchema,
} from "@/schemas/crm.schema";
import type { LeadStatus, OpportunityStage } from "@/generated/prisma/client";
import {
  activityRepository,
  contactRepository,
  customerRepository,
  leadRepository,
  opportunityRepository,
} from "./crm.repository";

/**
 * CRM business logic and permission checks.
 *
 * The interesting part is conversion. A lead that becomes a deal must not
 * require anyone to retype the customer — that is the "don't duplicate
 * information" principle the whole platform is built on, and it is where most
 * CRMs quietly leak duplicate client records.
 */

/**
 * Default probability per stage.
 *
 * A starting point, not a forecasting model. Nopedi's real numbers are an open
 * discovery question, and these exist so the weighted pipeline shows something
 * plausible for them to correct.
 */
const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  QUALIFIED: 25,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

const OPEN_STAGES: OpportunityStage[] = ["QUALIFIED", "PROPOSAL", "NEGOTIATION"];

export const crmService = {
  // -------------------------------------------------------------------------
  // Customers and contacts
  // -------------------------------------------------------------------------

  async listCustomers(search?: string) {
    await requirePermission("crm.customer.view");
    return customerRepository.list(search);
  },

  async getCustomer(id: string) {
    await requirePermission("crm.customer.view");
    const customer = await customerRepository.findById(id);
    if (!customer) throw new NotFoundError("Customer");
    return customer;
  },

  async createCustomer(input: unknown) {
    await requirePermission("crm.customer.create");
    const data = createCustomerSchema.parse(input);

    // Cheap guard against the most common data-quality failure in any CRM.
    const existing = await customerRepository.findByName(data.name);
    if (existing) {
      throw new BusinessRuleError(
        `A customer called "${existing.name}" already exists. Use that record ` +
          "rather than creating a second one.",
        { customerId: existing.id },
      );
    }

    return customerRepository.create({
      ...data,
      email: data.email || null,
    });
  },

  async addContact(input: unknown) {
    await requirePermission("crm.contact.manage");
    const data = createContactSchema.parse(input);

    const contact = await contactRepository.create({
      ...data,
      email: data.email || null,
    });

    // Exactly one primary contact per customer, enforced here rather than by a
    // partial unique index, which would block the ordinary "swap the primary"
    // edit by failing mid-way.
    if (data.isPrimary) {
      await contactRepository.clearPrimary(data.customerId, contact.id);
    }
    return contact;
  },

  // -------------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------------

  async listLeads(status?: LeadStatus[]) {
    await requirePermission("crm.lead.view");
    return leadRepository.list(status);
  },

  async getLead(id: string) {
    await requirePermission("crm.lead.view");
    const lead = await leadRepository.findById(id);
    if (!lead) throw new NotFoundError("Lead");
    return lead;
  },

  async createLead(input: unknown) {
    await requirePermission("crm.lead.create");
    const data = createLeadSchema.parse(input);
    const { userId } = requireRequestContext();

    return leadRepository.create({
      reference: await nextReference("LD"),
      companyName: data.companyName,
      contactName: data.contactName,
      email: data.email || null,
      phone: data.phone,
      source: data.source,
      sourceDetail: data.sourceDetail,
      description: data.description,
      estimatedValueCents: data.estimatedValueRands,
      ownerId: data.ownerId ?? userId,
      status: "NEW",
    });
  },

  async qualifyLead(leadId: string) {
    await requirePermission("crm.lead.edit");
    const lead = await leadRepository.findById(leadId);
    if (!lead) throw new NotFoundError("Lead");
    if (lead.status === "CONVERTED") {
      throw new BusinessRuleError("This lead has already been converted.");
    }
    return leadRepository.update(leadId, { status: "QUALIFIED" });
  },

  async disqualifyLead(input: unknown) {
    await requirePermission("crm.lead.edit");
    const { leadId, reason } = disqualifyLeadSchema.parse(input);

    const lead = await leadRepository.findById(leadId);
    if (!lead) throw new NotFoundError("Lead");
    if (lead.status === "CONVERTED") {
      throw new BusinessRuleError(
        "This lead has already been converted and cannot be disqualified.",
      );
    }

    return leadRepository.update(leadId, {
      status: "DISQUALIFIED",
      disqualifiedReason: reason,
    });
  },

  /**
   * Turns a lead into a customer and an opportunity.
   *
   * Nobody retypes anything: the customer is either an existing record or is
   * created from the lead, the opportunity inherits the lead's value, owner and
   * source, and the lead's call and meeting history is re-pointed onto the
   * opportunity so the timeline stays continuous from first enquiry to close.
   */
  async convertLead(input: unknown) {
    await requirePermission("crm.lead.convert");
    const data = convertLeadSchema.parse(input);
    const { userId } = requireRequestContext();

    const lead = await leadRepository.findById(data.leadId);
    if (!lead) throw new NotFoundError("Lead");
    if (lead.status === "CONVERTED") {
      throw new BusinessRuleError("This lead has already been converted.");
    }
    if (lead.status === "DISQUALIFIED") {
      throw new BusinessRuleError(
        "This lead was disqualified. Re-qualify it before converting.",
      );
    }

    let customerId = data.customerId;
    if (!customerId) {
      const existing = await customerRepository.findByName(data.newCustomerName!);
      if (existing) {
        throw new BusinessRuleError(
          `A customer called "${existing.name}" already exists. Convert against ` +
            "that record instead of creating a duplicate.",
          { customerId: existing.id },
        );
      }
      const created = await customerRepository.create({
        name: data.newCustomerName!,
        email: lead.email,
        phone: lead.phone,
      });
      customerId = created.id;
    }

    const opportunity = await opportunityRepository.create({
      reference: await nextReference("OPP"),
      title: data.opportunityTitle,
      description: lead.description,
      customerId,
      ownerId: lead.ownerId ?? userId,
      valueCents: data.valueRands ?? lead.estimatedValueCents,
      probability: data.probability,
      expectedCloseAt: data.expectedCloseAt,
      source: lead.source,
      stage: "QUALIFIED",
    });

    await activityRepository.moveAll(
      { entityType: "LEAD", entityId: lead.id },
      { entityType: "OPPORTUNITY", entityId: opportunity.id },
    );

    await leadRepository.update(lead.id, {
      status: "CONVERTED",
      convertedAt: new Date(),
      convertedCustomerId: customerId,
      convertedOpportunityId: opportunity.id,
    });

    return { opportunity, customerId };
  },

  // -------------------------------------------------------------------------
  // Opportunities
  // -------------------------------------------------------------------------

  async listOpportunities(stage?: OpportunityStage[]) {
    await requirePermission("crm.opportunity.view");
    return opportunityRepository.list(stage);
  },

  async getOpportunity(id: string) {
    await requirePermission("crm.opportunity.view");
    const opportunity = await opportunityRepository.findById(id);
    if (!opportunity) throw new NotFoundError("Opportunity");
    return opportunity;
  },

  async createOpportunity(input: unknown) {
    await requirePermission("crm.opportunity.create");
    const data = createOpportunitySchema.parse(input);
    const { userId } = requireRequestContext();

    return opportunityRepository.create({
      reference: await nextReference("OPP"),
      title: data.title,
      description: data.description,
      customerId: data.customerId,
      contactId: data.contactId,
      ownerId: data.ownerId ?? userId,
      valueCents: data.valueRands,
      probability: data.probability,
      expectedCloseAt: data.expectedCloseAt,
      source: data.source,
      tenderId: data.tenderId,
      stage: "QUALIFIED",
    });
  },

  async updateOpportunity(id: string, input: unknown) {
    await requirePermission("crm.opportunity.edit");
    const data = updateOpportunitySchema.parse(input);

    const existing = await opportunityRepository.findById(id);
    if (!existing) throw new NotFoundError("Opportunity");
    if (!OPEN_STAGES.includes(existing.stage)) {
      throw new BusinessRuleError(
        "This opportunity is closed. Reopen it before editing.",
      );
    }

    return opportunityRepository.update(id, {
      title: data.title,
      description: data.description,
      contactId: data.contactId,
      ownerId: data.ownerId,
      valueCents: data.valueRands,
      probability: data.probability,
      expectedCloseAt: data.expectedCloseAt,
      tenderId: data.tenderId,
    });
  },

  /**
   * Moves a deal between open stages.
   *
   * Probability follows the stage unless the owner overrides it, so a pipeline
   * nobody has hand-tuned still forecasts sensibly.
   */
  async advanceStage(input: unknown) {
    await requirePermission("crm.opportunity.edit");
    const { opportunityId, stage, probability } = advanceStageSchema.parse(input);

    const existing = await opportunityRepository.findById(opportunityId);
    if (!existing) throw new NotFoundError("Opportunity");
    if (!OPEN_STAGES.includes(existing.stage)) {
      throw new BusinessRuleError(
        "This opportunity is closed. Reopen it before changing its stage.",
      );
    }

    return opportunityRepository.update(opportunityId, {
      stage,
      probability: probability ?? STAGE_PROBABILITY[stage],
    });
  },

  /**
   * Closes a deal won or lost.
   *
   * Separate permission from editing, and a loss requires a reason. A pipeline
   * whose losses are unexplained teaches nobody anything.
   */
  async closeOpportunity(input: unknown) {
    await requirePermission("crm.opportunity.close");
    const data = closeOpportunitySchema.parse(input);

    const existing = await opportunityRepository.findById(data.opportunityId);
    if (!existing) throw new NotFoundError("Opportunity");
    if (!OPEN_STAGES.includes(existing.stage)) {
      throw new BusinessRuleError("This opportunity is already closed.");
    }

    return opportunityRepository.update(data.opportunityId, {
      stage: data.outcome,
      probability: STAGE_PROBABILITY[data.outcome],
      closedAt: new Date(),
      lostReason: data.outcome === "LOST" ? data.lostReason : null,
      valueCents: data.finalValueRands ?? existing.valueCents,
    });
  },

  async reopenOpportunity(id: string) {
    await requirePermission("crm.opportunity.close");
    const existing = await opportunityRepository.findById(id);
    if (!existing) throw new NotFoundError("Opportunity");
    if (OPEN_STAGES.includes(existing.stage)) {
      throw new BusinessRuleError("This opportunity is already open.");
    }
    return opportunityRepository.update(id, {
      stage: "NEGOTIATION",
      probability: STAGE_PROBABILITY.NEGOTIATION,
      closedAt: null,
      lostReason: null,
    });
  },

  async deleteOpportunity(id: string) {
    await requirePermission("crm.opportunity.delete");
    const existing = await opportunityRepository.findById(id);
    if (!existing) throw new NotFoundError("Opportunity");
    return opportunityRepository.softDelete(id);
  },

  // -------------------------------------------------------------------------
  // Activities
  // -------------------------------------------------------------------------

  async logActivity(input: unknown) {
    await requirePermission("crm.activity.log");
    const data = logActivitySchema.parse(input);
    const { userId } = requireRequestContext();

    return activityRepository.create({
      entityType: data.entityType,
      entityId: data.entityId,
      type: data.type,
      subject: data.subject,
      body: data.body,
      occurredAt: data.occurredAt,
      ownerId: userId,
    });
  },

  async activitiesFor(
    entityType: "LEAD" | "CUSTOMER" | "CONTACT" | "OPPORTUNITY" | "TENDER",
    entityId: string,
  ) {
    await requirePermission("crm.opportunity.view");
    return activityRepository.listFor(entityType, entityId);
  },
};

export { STAGE_PROBABILITY, OPEN_STAGES };
