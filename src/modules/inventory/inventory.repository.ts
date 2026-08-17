import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import type { Prisma, StockCountStatus } from "@/generated/prisma/client";

/** Data access for inventory. No rules, no permission checks (ADR-008). */

function tenant() {
  return requireRequestContext().organisationId;
}

/**
 * What a movement needs to be readable on a screen.
 *
 * A ledger line on its own says "40 out of a uuid on Tuesday", which is no use
 * to anybody looking for where the cement went.
 */
const MOVEMENT_CONTEXT = {
  stockItem: { select: { id: true, name: true, unit: true, reference: true } },
  fromLocation: { select: { id: true, name: true } },
  toLocation: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, reference: true } },
  issuedToEmployee: { select: { id: true, firstName: true, lastName: true } },
  goodsReceipt: {
    select: {
      id: true,
      reference: true,
      purchaseOrder: { select: { id: true, reference: true } },
    },
  },
} satisfies Prisma.StockMovementInclude;

const WHOLE_COUNT = {
  stockLocation: { select: { id: true, name: true } },
  countedByEmployee: { select: { id: true, firstName: true, lastName: true } },
  submittedBy: { select: { id: true, firstName: true, lastName: true } },
  acceptedBy: { select: { id: true, firstName: true, lastName: true } },
  lines: {
    include: {
      stockItem: { select: { id: true, name: true, unit: true, reference: true } },
    },
  },
} satisfies Prisma.StockCountInclude;

export const inventoryRepository = {
  // -------------------------------------------------------------------------
  // The register
  // -------------------------------------------------------------------------

  listItems() {
    return db.stockItem.findMany({ orderBy: { name: "asc" } });
  },

  findItem(id: string) {
    return db.stockItem.findUnique({ where: { id } });
  },

  createItem(data: Omit<Prisma.StockItemUncheckedCreateInput, "organisationId">) {
    return db.stockItem.create({ data: { ...data, organisationId: tenant() } });
  },

  updateItem(id: string, data: Prisma.StockItemUncheckedUpdateInput) {
    return db.stockItem.update({ where: { id }, data });
  },

  // -------------------------------------------------------------------------
  // Stores
  // -------------------------------------------------------------------------

  listLocations() {
    return db.stockLocation.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { project: { select: { id: true, name: true, reference: true } } },
    });
  },

  findLocation(id: string) {
    return db.stockLocation.findUnique({
      where: { id },
      include: { project: { select: { id: true, name: true, reference: true } } },
    });
  },

  findDefaultLocation() {
    return db.stockLocation.findFirst({ where: { isDefault: true } });
  },

  createLocation(
    data: Omit<Prisma.StockLocationUncheckedCreateInput, "organisationId">,
  ) {
    return db.stockLocation.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  updateLocation(id: string, data: Prisma.StockLocationUncheckedUpdateInput) {
    return db.stockLocation.update({ where: { id }, data });
  },

  /** Clears the default flag everywhere, so setting a new one leaves exactly one. */
  clearDefaultLocations() {
    return db.stockLocation.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  },

  // -------------------------------------------------------------------------
  // The ledger
  // -------------------------------------------------------------------------

  /**
   * Every movement, for replaying positions.
   *
   * Deliberately unfiltered by date. Weighted average cost is path dependent —
   * what stock leaves at depends on everything that came before it — so a
   * position computed from the last ninety days of movements is not the same
   * number as the one computed from the whole ledger, and it is the wrong one.
   * If this becomes slow the answer is a periodic opening balance to replay
   * from, not a shorter window.
   */
  listMovements(where: Prisma.StockMovementWhereInput = {}) {
    return db.stockMovement.findMany({
      where,
      orderBy: [{ movedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        stockItemId: true,
        kind: true,
        fromLocationId: true,
        toLocationId: true,
        quantity: true,
        unitCostCents: true,
        movedAt: true,
      },
    });
  },

  /** The same rows with enough attached to read on a screen. */
  listMovementsWithContext(where: Prisma.StockMovementWhereInput = {}) {
    return db.stockMovement.findMany({
      where,
      orderBy: [{ movedAt: "asc" }, { createdAt: "asc" }],
      include: MOVEMENT_CONTEXT,
    });
  },

  /** Newest first, for a screen somebody reads rather than arithmetic. */
  recentMovements(take: number, where: Prisma.StockMovementWhereInput = {}) {
    return db.stockMovement.findMany({
      where,
      orderBy: [{ movedAt: "desc" }, { createdAt: "desc" }],
      take,
      include: MOVEMENT_CONTEXT,
    });
  },

  createMovement(
    data: Omit<Prisma.StockMovementUncheckedCreateInput, "organisationId">,
  ) {
    return db.stockMovement.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  // -------------------------------------------------------------------------
  // Stocktakes
  // -------------------------------------------------------------------------

  listCounts(status?: StockCountStatus[]) {
    return db.stockCount.findMany({
      where: status?.length ? { status: { in: status } } : undefined,
      orderBy: { countedOn: "desc" },
      include: WHOLE_COUNT,
    });
  },

  findCount(id: string) {
    return db.stockCount.findUnique({ where: { id }, include: WHOLE_COUNT });
  },

  createCount(
    data: Omit<Prisma.StockCountUncheckedCreateInput, "organisationId">,
  ) {
    return db.stockCount.create({ data: { ...data, organisationId: tenant() } });
  },

  updateCount(id: string, data: Prisma.StockCountUncheckedUpdateInput) {
    return db.stockCount.update({ where: { id }, data });
  },

  /**
   * Writes a counted line, replacing whatever was there for that item.
   *
   * An upsert because counting is iterative: somebody walks the racks, writes
   * down forty, finds another pallet behind the door and writes down fifty-two.
   * The second figure is the count, not a second line.
   */
  upsertCountLine(
    stockCountId: string,
    stockItemId: string,
    data: { countedQuantity: number; expectedQuantity: number; note?: string },
  ) {
    const organisationId = tenant();
    return db.stockCountLine.upsert({
      where: {
        organisationId_stockCountId_stockItemId: {
          organisationId,
          stockCountId,
          stockItemId,
        },
      },
      create: { organisationId, stockCountId, stockItemId, ...data },
      update: data,
    });
  },

  updateCountLine(id: string, data: Prisma.StockCountLineUncheckedUpdateInput) {
    return db.stockCountLine.update({ where: { id }, data });
  },

  // -------------------------------------------------------------------------
  // The procurement hand-off
  // -------------------------------------------------------------------------

  /**
   * A delivery, with enough of the order attached to put it away.
   *
   * The price a receipt enters stock at comes off the ordered line rather than
   * off anything typed here, which is the point: the value of a yard is then
   * the sum of what was actually paid for it, and there is no second place
   * where somebody could type a different number.
   */
  findReceiptForPutaway(goodsReceiptId: string) {
    return db.goodsReceipt.findUnique({
      where: { id: goodsReceiptId },
      include: {
        lines: {
          include: {
            purchaseOrderLine: {
              select: {
                id: true,
                stockItemId: true,
                unitPriceCents: true,
                description: true,
              },
            },
          },
        },
      },
    });
  },
};
