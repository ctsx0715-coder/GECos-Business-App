import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import type { Prisma, Tender, TenderStatus } from "@/generated/prisma/client";

/**
 * Data access for tenders. The only layer allowed to touch Prisma directly
 * (ADR-008). No business rules and no permission checks live here.
 *
 * organisationId is passed explicitly to satisfy Prisma's generated types; the
 * extension verifies it against the bound request context and rejects a
 * mismatch, so this is belt and braces rather than trust.
 */

export interface TenderListFilters {
  status?: TenderStatus[];
  customerId?: string;
  /** Tenders closing within this many days, for the dashboard widget. */
  closingWithinDays?: number;
  search?: string;
}

function buildWhere(filters: TenderListFilters): Prisma.TenderWhereInput {
  const where: Prisma.TenderWhereInput = {};

  if (filters.status?.length) where.status = { in: filters.status };
  if (filters.customerId) where.customerId = filters.customerId;

  if (filters.closingWithinDays !== undefined) {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + filters.closingWithinDays);
    where.closingAt = { gte: new Date(), lte: until };
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { reference: { contains: filters.search, mode: "insensitive" } },
      { tenderNumber: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export const tenderRepository = {
  async list(
    filters: TenderListFilters = {},
    pagination: { skip?: number; take?: number } = {},
  ) {
    const where = buildWhere(filters);
    const [rows, total] = await Promise.all([
      db.tender.findMany({
        where,
        orderBy: { closingAt: "asc" },
        skip: pagination.skip ?? 0,
        take: pagination.take ?? 25,
        include: {
          customer: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      db.tender.count({ where }),
    ]);
    return { rows, total };
  },

  findById(id: string) {
    return db.tender.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        requirements: { orderBy: { sortOrder: "asc" } },
      },
    });
  },

  create(data: Omit<Prisma.TenderUncheckedCreateInput, "organisationId">) {
    const { organisationId } = requireRequestContext();
    return db.tender.create({ data: { ...data, organisationId } });
  },

  update(id: string, data: Prisma.TenderUncheckedUpdateInput): Promise<Tender> {
    return db.tender.update({ where: { id }, data });
  },

  softDelete(id: string) {
    return db.tender.delete({ where: { id } });
  },

  countByStatus(status: TenderStatus[]) {
    return db.tender.count({ where: { status: { in: status } } });
  },

  /** Checklist rows for one tender, ordered as the user arranged them. */
  requirements(tenderId: string) {
    return db.tenderRequirement.findMany({
      where: { tenderId },
      orderBy: { sortOrder: "asc" },
    });
  },

  createRequirements(
    tenderId: string,
    items: Array<{
      label: string;
      description?: string;
      isMandatory: boolean;
      sortOrder: number;
    }>,
  ) {
    const { organisationId } = requireRequestContext();
    return db.tenderRequirement.createMany({
      data: items.map((item) => ({ ...item, tenderId, organisationId })),
    });
  },

  setRequirementSatisfied(
    requirementId: string,
    satisfied: boolean,
    documentId?: string,
  ) {
    const { userId } = requireRequestContext();
    return db.tenderRequirement.update({
      where: { id: requirementId },
      data: satisfied
        ? { satisfiedAt: new Date(), satisfiedBy: userId, documentId }
        : { satisfiedAt: null, satisfiedBy: null, documentId: null },
    });
  },
};
