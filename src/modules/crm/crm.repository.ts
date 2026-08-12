import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import type {
  ActivityType,
  EntityType,
  LeadStatus,
  OpportunityStage,
  Prisma,
} from "@/generated/prisma/client";

/**
 * Data access for the CRM. No business rules and no permission checks here —
 * those belong one layer up (ADR-008).
 *
 * organisationId is passed explicitly to satisfy Prisma's generated types; the
 * extension verifies it against the bound context and rejects a mismatch.
 */

function tenant() {
  return requireRequestContext().organisationId;
}

export const customerRepository = {
  list(search?: string) {
    return db.customer.findMany({
      where: search
        ? { name: { contains: search, mode: "insensitive" } }
        : undefined,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { opportunities: true, tenders: true, contacts: true } },
      },
    });
  },

  findById(id: string) {
    return db.customer.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
        opportunities: {
          orderBy: { expectedCloseAt: "asc" },
          include: { owner: { select: { firstName: true, lastName: true } } },
        },
        tenders: {
          orderBy: { closingAt: "asc" },
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            closingAt: true,
          },
        },
      },
    });
  },

  create(data: Omit<Prisma.CustomerUncheckedCreateInput, "organisationId">) {
    return db.customer.create({ data: { ...data, organisationId: tenant() } });
  },

  findByName(name: string) {
    return db.customer.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  },
};

export const contactRepository = {
  create(data: Omit<Prisma.ContactUncheckedCreateInput, "organisationId">) {
    return db.contact.create({ data: { ...data, organisationId: tenant() } });
  },

  /** Clears the primary flag on a customer's other contacts. */
  clearPrimary(customerId: string, exceptId?: string) {
    return db.contact.updateMany({
      where: {
        customerId,
        isPrimary: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isPrimary: false },
    });
  },

  findById(id: string) {
    return db.contact.findUnique({ where: { id } });
  },
};

export const leadRepository = {
  list(status?: LeadStatus[]) {
    return db.lead.findMany({
      where: status?.length ? { status: { in: status } } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { firstName: true, lastName: true } },
        convertedCustomer: { select: { id: true, name: true } },
        convertedOpportunity: { select: { id: true, reference: true } },
      },
    });
  },

  findById(id: string) {
    return db.lead.findUnique({
      where: { id },
      include: {
        owner: { select: { firstName: true, lastName: true } },
        convertedCustomer: { select: { id: true, name: true } },
        convertedOpportunity: { select: { id: true, reference: true, title: true } },
      },
    });
  },

  create(data: Omit<Prisma.LeadUncheckedCreateInput, "organisationId">) {
    return db.lead.create({ data: { ...data, organisationId: tenant() } });
  },

  update(id: string, data: Prisma.LeadUncheckedUpdateInput) {
    return db.lead.update({ where: { id }, data });
  },

  countByStatus() {
    return db.lead.groupBy({ by: ["status"], _count: { _all: true } });
  },
};

export const opportunityRepository = {
  list(stage?: OpportunityStage[]) {
    return db.opportunity.findMany({
      where: stage?.length ? { stage: { in: stage } } : undefined,
      orderBy: [{ expectedCloseAt: "asc" }, { createdAt: "desc" }],
      include: {
        customer: { select: { id: true, name: true } },
        owner: { select: { firstName: true, lastName: true } },
        tender: { select: { id: true, reference: true } },
      },
    });
  },

  findById(id: string) {
    return db.opportunity.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, isPublicSector: true } },
        contact: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        tender: {
          select: { id: true, reference: true, title: true, status: true, closingAt: true },
        },
        convertedFromLead: { select: { id: true, reference: true, source: true } },
      },
    });
  },

  create(data: Omit<Prisma.OpportunityUncheckedCreateInput, "organisationId">) {
    return db.opportunity.create({ data: { ...data, organisationId: tenant() } });
  },

  update(id: string, data: Prisma.OpportunityUncheckedUpdateInput) {
    return db.opportunity.update({ where: { id }, data });
  },

  softDelete(id: string) {
    return db.opportunity.delete({ where: { id } });
  },
};

export const activityRepository = {
  listFor(entityType: EntityType, entityId: string, take = 50) {
    return db.activity.findMany({
      where: { entityType, entityId },
      orderBy: { occurredAt: "desc" },
      take,
      include: { owner: { select: { firstName: true, lastName: true } } },
    });
  },

  create(data: {
    entityType: EntityType;
    entityId: string;
    type: ActivityType;
    subject: string;
    body?: string;
    occurredAt: Date;
    ownerId: string | null;
  }) {
    return db.activity.create({ data: { ...data, organisationId: tenant() } });
  },

  /** Re-points a converted lead's history onto the opportunity it became. */
  moveAll(
    from: { entityType: EntityType; entityId: string },
    to: { entityType: EntityType; entityId: string },
  ) {
    return db.activity.updateMany({
      where: { entityType: from.entityType, entityId: from.entityId },
      data: { entityType: to.entityType, entityId: to.entityId },
    });
  },
};
