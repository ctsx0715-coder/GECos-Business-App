import { nextReference } from "@/lib/database/reference-numbers";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  abandonCountSchema,
  acceptCountSchema,
  adjustStockSchema,
  issueStockSchema,
  recordCountLinesSchema,
  returnStockSchema,
  startCountSchema,
  stockItemSchema,
  stockLocationSchema,
  submitCountSchema,
  transferStockSchema,
  updateStockItemSchema,
  updateStockLocationSchema,
} from "@/schemas/inventory.schema";
import { inventoryRepository } from "./inventory.repository";
import {
  concerns,
  countVariance,
  describeVariance,
  replay,
  stockLevel,
  suggestedOrderQuantity,
  type Item,
  type Movement,
  type Position,
  type StockLevel,
} from "./stock-ledger";

/**
 * Inventory.
 *
 * One rule carries the module, and it is the same shape as the three-way match
 * in procurement: the person who moves stock is not the person who corrects
 * the number afterwards.
 *
 * A storeman issues material all day, and that is his job. If he can also
 * write off the difference, the ledger agrees with the shelf every time anyone
 * asks and nothing that leaves is ever visible. So issuing is wide, adjusting
 * is narrow, and accepting a stocktake's variance cannot be done by whoever
 * counted it or handed it in.
 *
 * The arithmetic is all in `stock-ledger.ts`, with no database in it. What is
 * here is who may do what, and in what order.
 */

/** Prisma hands quantities back as Decimal; the ledger works in numbers. */
function toNumber(value: { toString(): string }): number {
  return Number(value.toString());
}

/** Below this, two quantities are the same quantity. */
const EPSILON = 0.0005;

/** A stored movement row, in the shape the ledger replays. */
type MovementRow = Awaited<
  ReturnType<typeof inventoryRepository.listMovements>
>[number];

function asMovement(row: MovementRow): Movement {
  return {
    id: row.id,
    kind: row.kind,
    fromLocationId: row.fromLocationId,
    toLocationId: row.toLocationId,
    quantity: toNumber(row.quantity),
    unitCostCents: row.unitCostCents === null ? null : Number(row.unitCostCents),
    movedAt: row.movedAt,
  };
}

type ItemRow = NonNullable<Awaited<ReturnType<typeof inventoryRepository.findItem>>>;

function asItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    reorderLevel: row.reorderLevel === null ? null : toNumber(row.reorderLevel),
    reorderQuantity:
      row.reorderQuantity === null ? null : toNumber(row.reorderQuantity),
  };
}

export interface ItemPosition {
  item: ItemRow;
  position: Position;
  level: StockLevel;
  suggestedOrderQuantity: number | null;
  concerns: string[];
}

/**
 * Replays the whole ledger, once, and hands back a position per item.
 *
 * One read rather than one per item. The register is a few hundred rows for a
 * contractor of this size and the movements are the volume, so fetching them
 * all once and grouping in memory is both faster and simpler than the query
 * per item it replaces — and the arithmetic has to see every movement anyway,
 * because weighted average cost depends on the whole sequence.
 */
async function positionsOf(items: ItemRow[]): Promise<ItemPosition[]> {
  const rows = await inventoryRepository.listMovements();

  const byItem = new Map<string, Movement[]>();
  for (const row of rows) {
    const list = byItem.get(row.stockItemId);
    if (list) list.push(asMovement(row));
    else byItem.set(row.stockItemId, [asMovement(row)]);
  }

  return items.map((row) => {
    const item = asItem(row);
    const position = replay(byItem.get(row.id) ?? []);
    return {
      item: row,
      position,
      level: stockLevel(item, position),
      suggestedOrderQuantity: suggestedOrderQuantity(item, position),
      concerns: concerns(item, position),
    };
  });
}

/** One item's position, for the screens and rules that only need the one. */
async function positionOf(row: ItemRow): Promise<Position> {
  const movements = await inventoryRepository.listMovements({
    stockItemId: row.id,
  });
  return replay(movements.map(asMovement));
}

export const inventoryService = {
  // -------------------------------------------------------------------------
  // The register
  // -------------------------------------------------------------------------

  async listItems() {
    await requirePermission("inventory.item.view");
    return inventoryRepository.listItems();
  },

  /** The register with what is on hand against each line. */
  async listPositions() {
    await requirePermission("inventory.stock.view");
    return positionsOf(await inventoryRepository.listItems());
  },

  async getItem(id: string) {
    await requirePermission("inventory.item.view");

    const row = await inventoryRepository.findItem(id);
    if (!row) throw new NotFoundError("Stock item");

    const item = asItem(row);
    const position = await positionOf(row);

    return {
      item: row,
      position,
      level: stockLevel(item, position),
      suggestedOrderQuantity: suggestedOrderQuantity(item, position),
      concerns: concerns(item, position),
      movements: await inventoryRepository.listMovementsWithContext({
        stockItemId: id,
      }),
      locations: await inventoryRepository.listLocations(),
    };
  },

  async createItem(input: unknown) {
    await requirePermission("inventory.item.manage");
    const data = stockItemSchema.parse(input);

    return inventoryRepository.createItem({
      reference: await nextReference("STK"),
      name: data.name,
      code: data.code,
      description: data.description,
      unit: data.unit,
      category: data.category,
      reorderLevel: data.reorderLevel ?? null,
      reorderQuantity: data.reorderQuantity ?? null,
      notes: data.notes,
    });
  },

  async updateItem(input: unknown) {
    await requirePermission("inventory.item.manage");
    const { id, ...data } = updateStockItemSchema.parse(input);

    const item = await inventoryRepository.findItem(id);
    if (!item) throw new NotFoundError("Stock item");

    return inventoryRepository.updateItem(id, {
      ...data,
      reorderLevel: data.reorderLevel ?? null,
      reorderQuantity: data.reorderQuantity ?? null,
    });
  },

  // -------------------------------------------------------------------------
  // Stores
  // -------------------------------------------------------------------------

  async listLocations() {
    await requirePermission("inventory.stock.view");
    return inventoryRepository.listLocations();
  },

  /**
   * Opening a store.
   *
   * Exactly one may be the default. Two stores both claiming to be where a
   * delivery lands when nobody says otherwise is a coin toss over where a load
   * of cement went, so setting a new one stands the old one down rather than
   * refusing.
   */
  async createLocation(input: unknown) {
    await requirePermission("inventory.location.manage");
    const data = stockLocationSchema.parse(input);

    if (data.isDefault) await inventoryRepository.clearDefaultLocations();

    return inventoryRepository.createLocation({
      name: data.name,
      projectId: data.projectId ?? null,
      address: data.address,
      isDefault: data.isDefault,
      notes: data.notes,
    });
  },

  async updateLocation(input: unknown) {
    await requirePermission("inventory.location.manage");
    const { id, ...data } = updateStockLocationSchema.parse(input);

    const location = await inventoryRepository.findLocation(id);
    if (!location) throw new NotFoundError("Store");

    if (data.isDefault) await inventoryRepository.clearDefaultLocations();

    return inventoryRepository.updateLocation(id, {
      ...data,
      projectId: data.projectId ?? null,
    });
  },

  // -------------------------------------------------------------------------
  // Moving stock
  // -------------------------------------------------------------------------

  /**
   * Issuing material out.
   *
   * Deliberately not refused when it takes the balance below zero.
   *
   * The temptation is to block it — the ledger says thirty bags and forty are
   * physically going out of the door, so something is wrong. But the forty
   * bags are leaving whatever this software says, and a storeman who is told
   * "no" simply does not record it. The ledger is then wrong *and* nobody
   * knows it is wrong, which is strictly worse than a negative balance that
   * says out loud that a delivery was never captured.
   *
   * So it goes through, and the resulting position comes back with it so the
   * screen can say what just happened.
   */
  async issue(input: unknown) {
    await requirePermission("inventory.stock.issue");
    const data = issueStockSchema.parse(input);

    const item = await this.mustBeAnItem(data.stockItemId);
    await this.mustBeAStore(data.fromLocationId);

    await inventoryRepository.createMovement({
      stockItemId: item.id,
      kind: "ISSUE",
      fromLocationId: data.fromLocationId,
      toLocationId: null,
      quantity: data.quantity,
      movedAt: data.movedAt,
      projectId: data.projectId ?? null,
      issuedToEmployeeId: data.issuedToEmployeeId ?? null,
      note: data.note,
    });

    return this.afterMoving(item, data.fromLocationId);
  },

  /** Material coming back off a site unused. */
  async returnToStore(input: unknown) {
    await requirePermission("inventory.stock.issue");
    const data = returnStockSchema.parse(input);

    const item = await this.mustBeAnItem(data.stockItemId);
    await this.mustBeAStore(data.toLocationId);

    await inventoryRepository.createMovement({
      stockItemId: item.id,
      kind: "RETURN",
      fromLocationId: null,
      toLocationId: data.toLocationId,
      quantity: data.quantity,
      movedAt: data.movedAt,
      projectId: data.projectId ?? null,
      note: data.note,
    });

    return this.afterMoving(item, data.toLocationId);
  },

  /**
   * Between our own stores.
   *
   * Refused when the store it is leaving does not hold it, and this is the one
   * movement where refusing is right: a transfer is a piece of administration
   * rather than a physical event that has already happened, and the usual
   * cause of one that goes negative is the wrong store picked off a list.
   */
  async transfer(input: unknown) {
    await requirePermission("inventory.stock.transfer");
    const data = transferStockSchema.parse(input);

    const item = await this.mustBeAnItem(data.stockItemId);
    const from = await this.mustBeAStore(data.fromLocationId);
    await this.mustBeAStore(data.toLocationId);

    const position = await positionOf(item);
    const onHand = position.byLocation.get(data.fromLocationId) ?? 0;
    if (data.quantity > onHand + EPSILON) {
      throw new BusinessRuleError(
        `${from.name} does not hold that much ${item.name} — there are ${onHand} ${item.unit} there. ` +
          "Check the store, or record what arrived first.",
      );
    }

    await inventoryRepository.createMovement({
      stockItemId: item.id,
      kind: "TRANSFER",
      fromLocationId: data.fromLocationId,
      toLocationId: data.toLocationId,
      quantity: data.quantity,
      movedAt: data.movedAt,
      note: data.note,
    });

    return this.afterMoving(item, data.fromLocationId);
  },

  /**
   * Correcting the ledger, or writing stock off.
   *
   * The narrow permission, and the reason the module has two. Whoever can do
   * this can make the register say anything, so it is kept away from whoever
   * moves the stock — and the reason is mandatory, because an adjustment with
   * no reason is indistinguishable from somebody making the number say what
   * they wanted it to say.
   */
  async adjust(input: unknown) {
    await requirePermission("inventory.stock.adjust");
    const data = adjustStockSchema.parse(input);

    const item = await this.mustBeAnItem(data.stockItemId);
    await this.mustBeAStore(data.locationId);

    const goingOut = data.quantity < 0;

    await inventoryRepository.createMovement({
      stockItemId: item.id,
      kind: data.kind,
      fromLocationId: goingOut ? data.locationId : null,
      toLocationId: goingOut ? null : data.locationId,
      quantity: Math.abs(data.quantity),
      movedAt: data.movedAt,
      reason: data.reason,
      note: data.note,
    });

    return this.afterMoving(item, data.locationId);
  },

  // -------------------------------------------------------------------------
  // Stocktakes
  // -------------------------------------------------------------------------

  async listCounts() {
    await requirePermission("inventory.count.view");
    const counts = await inventoryRepository.listCounts();
    return Promise.all(counts.map((count) => this.withVariance(count)));
  },

  async getCount(id: string) {
    await requirePermission("inventory.count.view");

    const count = await inventoryRepository.findCount(id);
    if (!count) throw new NotFoundError("Stock count");

    return {
      ...(await this.withVariance(count)),
      canAccept: await hasPermission("inventory.count.approve"),
    };
  },

  async startCount(input: unknown) {
    await requirePermission("inventory.count.record");
    const data = startCountSchema.parse(input);

    await this.mustBeAStore(data.stockLocationId);

    return inventoryRepository.createCount({
      reference: await nextReference("SC"),
      stockLocationId: data.stockLocationId,
      countedOn: data.countedOn,
      countedByEmployeeId: data.countedByEmployeeId ?? null,
      note: data.note,
      status: "DRAFT",
    });
  },

  /**
   * Writing down what is on the shelf.
   *
   * The expected quantity is written at the same time but is not what the
   * count is measured against yet — it is refreshed on submit. Somebody
   * counting a large store takes a morning over it, and the ledger moves under
   * them while they do; freezing the comparison at the moment they opened the
   * screen would turn every delivery taken in during the count into a variance
   * that nobody can explain.
   */
  async recordCountLines(input: unknown) {
    await requirePermission("inventory.count.record");
    const { id, lines } = recordCountLinesSchema.parse(input);

    const count = await this.mustBeCountable(id);

    for (const line of lines) {
      const item = await this.mustBeAnItem(line.stockItemId);
      const position = await positionOf(item);

      await inventoryRepository.upsertCountLine(count.id, item.id, {
        countedQuantity: line.countedQuantity,
        expectedQuantity: position.byLocation.get(count.stockLocationId) ?? 0,
        note: line.note,
      });
    }

    return inventoryRepository.findCount(count.id);
  },

  /**
   * Handing the count in.
   *
   * This is where the variance is frozen: every line's expected quantity is
   * rewritten from the ledger as it stands right now, and from here on the
   * figures do not move. A variance that is recomputed on the fly changes
   * every time anything is issued, so the shortfall a manager accepted on
   * Tuesday is not the one the screen shows on Thursday — and the adjustment
   * that was posted against it no longer reconciles to anything.
   */
  async submitCount(input: unknown) {
    const actorId = await requirePermission("inventory.count.record");
    const { id } = submitCountSchema.parse(input);

    const count = await this.mustBeCountable(id);
    if (count.lines.length === 0) {
      throw new BusinessRuleError("Nothing has been counted yet.");
    }

    for (const line of count.lines) {
      const item = await inventoryRepository.findItem(line.stockItemId);
      if (!item) continue;
      const position = await positionOf(item);
      await inventoryRepository.updateCountLine(line.id, {
        expectedQuantity: position.byLocation.get(count.stockLocationId) ?? 0,
      });
    }

    return inventoryRepository.updateCount(count.id, {
      status: "COUNTED",
      submittedById: actorId,
      submittedAt: new Date(),
    });
  },

  /**
   * Accepting the variance into the ledger.
   *
   * Two rules, and both of them are the module.
   *
   * Separation of duties first: holding `inventory.count.approve` is not
   * enough if you counted the store or handed the count in. A stocktake that
   * the person being checked can sign off checks nobody, and the whole reason
   * to count a store is that somebody outside it wants to know.
   *
   * Then the shortfall. Accepting a count writes off whatever is missing, and
   * a write-off of any size has to be said out loud rather than absorbed —
   * material worth thousands of rand does not evaporate, and the reason
   * somebody gives is the only record of what they believed at the time.
   */
  async acceptCount(input: unknown) {
    const actorId = await requirePermission("inventory.count.approve");
    const { id, reason } = acceptCountSchema.parse(input);

    const count = await inventoryRepository.findCount(id);
    if (!count) throw new NotFoundError("Stock count");
    if (count.status !== "COUNTED") {
      throw new BusinessRuleError(
        count.status === "DRAFT"
          ? "That count has not been handed in yet."
          : "That count is finished with.",
      );
    }

    if (count.submittedById === actorId) {
      throw new ForbiddenError(
        "You cannot accept a count you handed in yourself. Ask somebody else to check it.",
      );
    }
    if (count.createdBy && count.createdBy === actorId) {
      throw new ForbiddenError(
        "You cannot accept a count you carried out. Ask somebody else to check it.",
      );
    }

    const measured = await this.varianceOf(count);
    if (measured.shortfallCents > 0 && !reason) {
      throw new BusinessRuleError(
        `This count is ${describeVariance(measured)}. Say what happened to it before it is written off.`,
      );
    }

    /*
     * One adjustment per line that disagrees, and none for the lines that
     * agree. A movement of zero is not an event, and a ledger full of them
     * buries the ones that matter.
     */
    for (const line of measured.discrepancies) {
      const goingOut = line.varianceQuantity < 0;
      await inventoryRepository.createMovement({
        stockItemId: line.stockItemId,
        kind: goingOut ? "WRITE_OFF" : "ADJUSTMENT",
        fromLocationId: goingOut ? count.stockLocationId : null,
        toLocationId: goingOut ? null : count.stockLocationId,
        quantity: Math.abs(line.varianceQuantity),
        movedAt: count.countedOn,
        stockCountId: count.id,
        reason: reason ?? `Stocktake ${count.reference}`,
      });
    }

    return inventoryRepository.updateCount(count.id, {
      status: "ACCEPTED",
      acceptedById: actorId,
      acceptedAt: new Date(),
      note: reason
        ? `${count.note ? `${count.note}\n\n` : ""}Accepted: ${reason}`
        : count.note,
    });
  },

  /**
   * Giving up on a count.
   *
   * A half-counted store is worse than an uncounted one, because every rack
   * nobody reached reads as a rack that has been emptied. Abandoning it is
   * therefore a real decision with a reason on it, and once a count has been
   * handed in it is not the counter's to withdraw.
   */
  async abandonCount(input: unknown) {
    const { id, reason } = abandonCountSchema.parse(input);

    const count = await inventoryRepository.findCount(id);
    if (!count) throw new NotFoundError("Stock count");
    if (count.status === "ACCEPTED" || count.status === "ABANDONED") {
      throw new BusinessRuleError("That count is finished with.");
    }

    await requirePermission(
      count.status === "DRAFT"
        ? "inventory.count.record"
        : "inventory.count.approve",
    );

    return inventoryRepository.updateCount(count.id, {
      status: "ABANDONED",
      abandonedReason: reason,
    });
  },

  // -------------------------------------------------------------------------
  // The procurement hand-off
  // -------------------------------------------------------------------------

  /**
   * Putting a delivery away.
   *
   * Called by the procurement service the moment a goods receipt is recorded,
   * which is why there is no permission check of its own: signing for a
   * delivery is already gated by `procurement.receipt.record`, and a second
   * permission over the same physical act would only ever be the one somebody
   * forgot to grant, leaving a yard full of stock the register denies.
   *
   * Nothing is put away unless the receipt names a store. That covers both the
   * tenant who does not run this module — they have no stores, so the field is
   * never set — and the load that went straight off the truck onto the slab,
   * which is most readymix and most of the reinforcing on a busy site. A
   * delivery that was never in a store must not appear in one.
   *
   * Only lines whose ordered line names a stock item are put away. Plant hire
   * and a subcontractor's labour are ordinary purchase order lines that never
   * sit on a shelf.
   */
  async putAwayReceipt(goodsReceiptId: string) {
    const receipt = await inventoryRepository.findReceiptForPutaway(goodsReceiptId);
    if (!receipt?.stockLocationId) return { movements: 0 };

    // Idempotent. The caller records a receipt once, but a retry after a
    // half-failed write must not double the yard.
    const already = await inventoryRepository.listMovements({ goodsReceiptId });
    if (already.length > 0) return { movements: already.length };

    let movements = 0;
    for (const line of receipt.lines) {
      const ordered = line.purchaseOrderLine;
      if (!ordered?.stockItemId) continue;

      // What was accepted, not what was delivered. Goods sent back went back
      // on the truck and were never in the store.
      const quantity = toNumber(line.quantity);
      if (quantity <= EPSILON) continue;

      await inventoryRepository.createMovement({
        stockItemId: ordered.stockItemId,
        kind: "RECEIPT",
        fromLocationId: null,
        toLocationId: receipt.stockLocationId,
        quantity,
        unitCostCents: ordered.unitPriceCents,
        movedAt: receipt.receivedAt,
        goodsReceiptId: receipt.id,
        purchaseOrderLineId: ordered.id,
      });
      movements += 1;
    }

    return { movements };
  },

  // -------------------------------------------------------------------------
  // What a project has drawn
  // -------------------------------------------------------------------------

  /**
   * The value of stock issued to a project.
   *
   * Deliberately *not* added to the project's budget, and this is the decision
   * worth arguing with rather than the arithmetic.
   *
   * The budget already counts an approved purchase order as committed. Most
   * material a site draws was bought on an order that named the site, so
   * adding the issue on top counts the same cement twice — once when it was
   * ordered and again when it was carried out of the store. The figure that
   * would produce is not conservative, it is simply wrong, and a project
   * manager who is told they are R400 000 over on a job that is fine stops
   * reading the number.
   *
   * What it is genuinely for is the yard: material bought on an order with no
   * project on it is committed to nobody, and this is the only place it
   * becomes attributable to a job at all. So it is shown next to the budget as
   * its own figure, with the double-count said out loud on the screen, rather
   * than folded into a total that cannot distinguish the two cases.
   */
  async issuedTo(projectId: string) {
    await requirePermission("inventory.stock.view");

    const movements = await inventoryRepository.listMovementsWithContext({
      projectId,
      kind: { in: ["ISSUE", "RETURN"] },
    });

    const items = await inventoryRepository.listItems();
    const positions = await positionsOf(items);
    const costOf = new Map(
      positions.map((entry) => [entry.item.id, entry.position.unitCostCents]),
    );

    const valueCents = movements.reduce((total, movement) => {
      const unitCost = costOf.get(movement.stockItemId) ?? 0;
      const value = Math.round(toNumber(movement.quantity) * unitCost);
      // A return is material that came back, so it comes off what the job took.
      return movement.kind === "RETURN" ? total - value : total + value;
    }, 0);

    return { movements, valueCents };
  },

  // -------------------------------------------------------------------------
  // What needs somebody today
  // -------------------------------------------------------------------------

  async overview() {
    await requirePermission("inventory.stock.view");

    const positions = await positionsOf(await inventoryRepository.listItems());
    const counts = await inventoryRepository.listCounts(["DRAFT", "COUNTED"]);

    return {
      itemCount: positions.length,
      valueCents: positions.reduce(
        (total, entry) => total + entry.position.valueCents,
        0,
      ),
      // Worst first, the way `concerns` orders itself: a ledger that says less
      // than nothing outranks a shelf that is merely empty, because it cannot
      // be trusted to say whether anything else is empty either.
      impossible: positions.filter((entry) => entry.position.quantity < -EPSILON),
      suspect: positions.filter(
        (entry) =>
          entry.position.quantity >= -EPSILON && entry.position.wentNegative,
      ),
      out: positions.filter((entry) => entry.level === "OUT"),
      low: positions.filter((entry) => entry.level === "LOW"),
      awaitingAcceptance: counts.filter((count) => count.status === "COUNTED"),
      counting: counts.filter((count) => count.status === "DRAFT"),
      recentMovements: await inventoryRepository.recentMovements(12),
      canIssue: await hasPermission("inventory.stock.issue"),
      canAdjust: await hasPermission("inventory.stock.adjust"),
      canCount: await hasPermission("inventory.count.record"),
    };
  },

  // -------------------------------------------------------------------------

  /** The position and the plain-language version of it, after something moved. */
  async afterMoving(item: ItemRow, locationId: string) {
    const position = await positionOf(item);
    return {
      item,
      position,
      onHandHere: position.byLocation.get(locationId) ?? 0,
      concerns: concerns(asItem(item), position),
    };
  },

  async mustBeAnItem(id: string) {
    const item = await inventoryRepository.findItem(id);
    if (!item) throw new NotFoundError("Stock item");
    return item;
  },

  async mustBeAStore(id: string) {
    const location = await inventoryRepository.findLocation(id);
    if (!location) throw new NotFoundError("Store");
    return location;
  },

  /** A count that can still be written to, or the reason it cannot be. */
  async mustBeCountable(id: string) {
    const count = await inventoryRepository.findCount(id);
    if (!count) throw new NotFoundError("Stock count");
    if (count.status !== "DRAFT") {
      throw new BusinessRuleError(
        count.status === "COUNTED"
          ? "That count has been handed in. Counting it again would move the figures somebody is checking."
          : "That count is finished with.",
      );
    }
    return count;
  },

  /**
   * What a count found, valued at each item's average cost.
   *
   * The cost comes from the ledger as it stands rather than from the count,
   * because a count says how many there are and never what they are worth.
   */
  async varianceOf(count: {
    lines: Array<{
      stockItemId: string;
      countedQuantity: { toString(): string };
      expectedQuantity: { toString(): string };
    }>;
  }) {
    const items = await inventoryRepository.listItems();
    const positions = await positionsOf(items);
    const costOf = new Map(
      positions.map((entry) => [entry.item.id, entry.position.unitCostCents]),
    );

    return countVariance(
      count.lines.map((line) => ({
        stockItemId: line.stockItemId,
        countedQuantity: toNumber(line.countedQuantity),
        expectedQuantity: toNumber(line.expectedQuantity),
      })),
      (stockItemId) => costOf.get(stockItemId) ?? 0,
    );
  },

  async withVariance<
    T extends {
      lines: Array<{
        stockItemId: string;
        countedQuantity: { toString(): string };
        expectedQuantity: { toString(): string };
      }>;
    },
  >(count: T) {
    const variance = await this.varianceOf(count);
    return { ...count, variance, varianceSummary: describeVariance(variance) };
  },
};
