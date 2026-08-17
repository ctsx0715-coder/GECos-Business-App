import { db } from "@/lib/database/client";
import { nextReference } from "@/lib/database/reference-numbers";
import type {
  ExpenseCategory,
  StockCountStatus,
  StockMovementKind,
} from "@/generated/prisma/client";

/**
 * The inventory demonstration dataset.
 *
 * Written to exercise the ledger rather than to fill a table. The claim of the
 * module is that stock on hand is derived from movements and that the awkward
 * cases are the ones worth having, so eight tidy items that all balance prove
 * none of it. Every state the ledger can be in has an item in it:
 *
 *   - one comfortably in stock, bought twice at different prices, so the
 *     average cost on screen is neither of the two prices paid;
 *   - two down to their reorder level, with a quantity a buyer can order, and
 *     both of them stocked partly by a delivery that put itself away against a
 *     purchase order that was already there — which is the hand-off the module
 *     is arranged around and is worth showing on real orders;
 *   - one at zero;
 *   - one whose balance is *negative* — forty bags issued out of a store the
 *     ledger says held thirty, which is the delivery nobody captured and is
 *     the single most useful thing this module surfaces;
 *   - one that went negative earlier in the week and has since come right,
 *     because that is invisible from today's balance and still worth asking
 *     about;
 *   - one split across the yard and a site store, so "in stock" and "in stock
 *     where it is needed" can be different answers;
 *   - one with no reorder level at all, which must never appear on a buying
 *     list however empty it is.
 *
 * Two stocktakes, for the same reason. One is sitting handed-in and unaccepted
 * so there is something for a finance manager to do on the demonstration, and
 * one has been accepted so the write-off it produced is in the ledger with a
 * reason attached.
 *
 * Idempotent, like the HR, safety and procurement datasets and for the same
 * reason: the seed builds a database from nothing and the backfill runs
 * against one that has been live for weeks. Items are matched on name, stores
 * on name, and movements on the note they carry.
 */

const DAY = 86_400_000;

/** N days from today at a plausible hour, so the ledger reads like a week. */
function daysAtHour(offset: number, hour: number): Date {
  const date = new Date(Date.now() + offset * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export interface StoreSpec {
  name: string;
  /** Matched against a project name. Undefined is the yard or the office. */
  site?: string;
  address?: string;
  isDefault?: boolean;
}

export const STORES: StoreSpec[] = [
  {
    name: "Main yard — Silverton",
    address: "14 Dykor Street, Silverton, Pretoria",
    isDefault: true,
  },
  {
    name: "Water treatment site store",
    site: "Water treatment",
    address: "Container 2, gate 4",
  },
  {
    name: "Workshop lock-up",
    address: "Behind the fitting bay, Silverton",
  },
];

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

export interface ItemSpec {
  name: string;
  code: string;
  unit: string;
  category: ExpenseCategory;
  reorderLevel: number | null;
  reorderQuantity: number | null;
  description?: string;
  /**
   * A fragment of a purchase order line's description. Where one matches, the
   * order line is pointed at this item and its delivery is put away — which is
   * the hand-off the module is arranged around, and it is worth showing
   * against orders that already exist rather than inventing new ones.
   */
  matchOrderLine?: string;
}

export const ITEMS: ItemSpec[] = [
  {
    name: "Cement 42.5N — 50kg bag",
    code: "CEM-425-50",
    unit: "bag",
    category: "MATERIALS",
    reorderLevel: 120,
    reorderQuantity: 240,
    description: "Common bagged cement. Everything on site uses it.",
  },
  {
    name: "Y12 reinforcing bar",
    code: "REO-Y12",
    unit: "tonne",
    category: "MATERIALS",
    reorderLevel: 3,
    reorderQuantity: 8,
    description: "Held by mass, which is how it is bought and how it is priced.",
    matchOrderLine: "y12",
  },
  {
    name: "Ref 193 mesh sheets",
    code: "REO-MESH-193",
    unit: "sheet",
    category: "MATERIALS",
    reorderLevel: 20,
    reorderQuantity: 60,
    matchOrderLine: "ref 193 mesh",
  },
  {
    name: "Building sand",
    code: "AGG-SAND",
    unit: "m³",
    category: "MATERIALS",
    reorderLevel: 15,
    reorderQuantity: 30,
  },
  {
    name: "Hard hat — white",
    code: "PPE-HAT-W",
    unit: "each",
    category: "OTHER",
    reorderLevel: 20,
    reorderQuantity: 50,
    description: "Issued to every visitor and every new starter.",
    matchOrderLine: "hard hat",
  },
  {
    name: "Safety boots — assorted sizes",
    code: "PPE-BOOT",
    unit: "each",
    category: "OTHER",
    reorderLevel: 12,
    reorderQuantity: 24,
  },
  {
    name: "Shutter ply — 18mm",
    code: "TMB-PLY-18",
    unit: "sheet",
    category: "MATERIALS",
    reorderLevel: 25,
    reorderQuantity: 60,
  },
  {
    name: "Diesel — bulk tank",
    code: "FUEL-DSL",
    unit: "l",
    category: "PLANT",
    // Deliberately no level. Fuel is drawn against the tank gauge rather than
    // reordered off a list, and an item with no level must never raise an
    // alert nobody asked for.
    reorderLevel: null,
    reorderQuantity: null,
  },
];

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

export interface MovementSpec {
  item: string;
  kind: StockMovementKind;
  /** Store names. One side null is in or out; both is a transfer. */
  from?: string;
  to?: string;
  quantity: number;
  /** Rands. Only on the movements that bring stock in with a price. */
  unitPriceRands?: number;
  daysAgo: number;
  /** Matched against a project name. */
  site?: string;
  /** Matched against an employee's full name. */
  issuedTo?: string;
  reason?: string;
  /** The natural key. Distinctive enough not to collide. */
  note: string;
}

const YARD = "Main yard — Silverton";
const SITE = "Water treatment site store";
const LOCKUP = "Workshop lock-up";

export const MOVEMENTS: MovementSpec[] = [
  // Cement, bought twice at different prices so the average is neither.
  {
    item: "Cement 42.5N — 50kg bag",
    kind: "RECEIPT",
    to: YARD,
    quantity: 400,
    unitPriceRands: 118.5,
    daysAgo: 26,
    note: "Opening stock, February delivery",
  },
  {
    item: "Cement 42.5N — 50kg bag",
    kind: "RECEIPT",
    to: YARD,
    quantity: 300,
    unitPriceRands: 132,
    daysAgo: 11,
    note: "March delivery, after the price rise",
  },
  {
    item: "Cement 42.5N — 50kg bag",
    kind: "ISSUE",
    from: YARD,
    quantity: 240,
    daysAgo: 9,
    site: "Water treatment",
    issuedTo: "Jacob Mthembu",
    note: "Ground floor slab, water treatment works",
  },
  {
    item: "Cement 42.5N — 50kg bag",
    kind: "TRANSFER",
    from: YARD,
    to: SITE,
    quantity: 180,
    daysAgo: 7,
    note: "Stocked the site container ahead of the pour",
  },
  {
    item: "Cement 42.5N — 50kg bag",
    kind: "ISSUE",
    from: SITE,
    quantity: 150,
    daysAgo: 4,
    site: "Water treatment",
    note: "First floor columns",
  },
  {
    item: "Cement 42.5N — 50kg bag",
    kind: "RETURN",
    to: SITE,
    quantity: 12,
    daysAgo: 2,
    site: "Water treatment",
    note: "Left over off the columns, back in the container",
  },

  /*
   * Reinforcing, down to the reorder level.
   *
   * The opening stock is here and the rest of it arrived on a purchase order,
   * which is the hand-off: the delivery signed for against that order put
   * itself into the yard at the price on the order, so the average below is a
   * blend of a price this file set and one a buyer negotiated.
   */
  {
    item: "Y12 reinforcing bar",
    kind: "RECEIPT",
    to: YARD,
    quantity: 4,
    unitPriceRands: 17_900,
    daysAgo: 21,
    note: "Opening stock, reinforcing",
  },
  {
    item: "Y12 reinforcing bar",
    kind: "ISSUE",
    from: YARD,
    quantity: 6.5,
    daysAgo: 6,
    site: "Water treatment",
    issuedTo: "Jacob Mthembu",
    note: "Column starter bars and the slab cage",
  },
  {
    item: "Ref 193 mesh sheets",
    kind: "ISSUE",
    from: YARD,
    quantity: 44,
    daysAgo: 5,
    site: "Water treatment",
    issuedTo: "Jacob Mthembu",
    note: "Slab mesh, ground floor",
  },

  // Sand, run to nothing.
  {
    item: "Building sand",
    kind: "RECEIPT",
    to: YARD,
    quantity: 40,
    unitPriceRands: 320,
    daysAgo: 19,
    note: "Opening stock, sand",
  },
  {
    item: "Building sand",
    kind: "ISSUE",
    from: YARD,
    quantity: 40,
    daysAgo: 5,
    site: "Water treatment",
    note: "Bedding and plaster mix, all of it",
  },

  /*
   * Hard hats: the negative balance.
   *
   * Thirty went into the yard and forty-two have been issued out of it. The
   * yard is not wrong — a box of hats arrived and nobody captured it — and the
   * whole point of allowing this is that the ledger says so out loud instead of
   * refusing the issue and losing the record of it.
   */
  {
    item: "Hard hat — white",
    kind: "RECEIPT",
    to: YARD,
    quantity: 30,
    unitPriceRands: 89,
    daysAgo: 30,
    note: "Opening stock, hard hats",
  },
  {
    item: "Hard hat — white",
    kind: "ISSUE",
    from: YARD,
    quantity: 24,
    daysAgo: 12,
    site: "Water treatment",
    note: "New starters and the site induction batch",
  },
  {
    item: "Hard hat — white",
    kind: "ISSUE",
    from: YARD,
    quantity: 18,
    daysAgo: 3,
    site: "Water treatment",
    note: "Second induction batch — the store says we should not have had these",
  },

  /*
   * Safety boots: went negative and has since come right.
   *
   * The delivery was captured four days later than it happened and dated to
   * the day somebody noticed, which is what really happens. Today's balance is
   * healthy and the impossible week is still on the record.
   */
  {
    item: "Safety boots — assorted sizes",
    kind: "RECEIPT",
    to: YARD,
    quantity: 20,
    unitPriceRands: 640,
    daysAgo: 24,
    note: "Opening stock, boots",
  },
  {
    item: "Safety boots — assorted sizes",
    kind: "ISSUE",
    from: YARD,
    quantity: 26,
    daysAgo: 15,
    site: "Water treatment",
    note: "Winter issue to the concrete crew",
  },
  {
    item: "Safety boots — assorted sizes",
    kind: "RECEIPT",
    to: YARD,
    quantity: 30,
    unitPriceRands: 655,
    daysAgo: 13,
    note: "The pallet nobody had captured, entered when the shortfall was noticed",
  },

  // Ply, split across the yard and the lock-up.
  {
    item: "Shutter ply — 18mm",
    kind: "RECEIPT",
    to: YARD,
    quantity: 120,
    unitPriceRands: 512,
    daysAgo: 17,
    note: "Opening stock, shutter ply",
  },
  {
    item: "Shutter ply — 18mm",
    kind: "TRANSFER",
    from: YARD,
    to: LOCKUP,
    quantity: 40,
    daysAgo: 10,
    note: "Kept dry in the lock-up",
  },
  {
    item: "Shutter ply — 18mm",
    kind: "ISSUE",
    from: YARD,
    quantity: 62,
    daysAgo: 8,
    site: "Water treatment",
    note: "Column and beam shutters",
  },
  {
    item: "Shutter ply — 18mm",
    kind: "WRITE_OFF",
    from: YARD,
    quantity: 6,
    daysAgo: 6,
    reason: "Delaminated after the roof leak in the yard",
    note: "Roof leak damage, shutter ply",
  },

  // Diesel: plenty of movement, no reorder level, so no alert.
  {
    item: "Diesel — bulk tank",
    kind: "RECEIPT",
    to: YARD,
    quantity: 2500,
    unitPriceRands: 23.4,
    daysAgo: 20,
    note: "Bulk tank fill",
  },
  {
    item: "Diesel — bulk tank",
    kind: "ISSUE",
    from: YARD,
    quantity: 1840,
    daysAgo: 2,
    site: "Water treatment",
    note: "Plant refuelling for the fortnight",
  },
];

// ---------------------------------------------------------------------------
// Stocktakes
// ---------------------------------------------------------------------------

export interface CountSpec {
  store: string;
  daysAgo: number;
  status: StockCountStatus;
  countedBy?: string;
  note: string;
  /** Item name to what was physically found. */
  counted: Array<{ item: string; quantity: number }>;
  /** On an accepted count, why the difference was signed off. */
  acceptedReason?: string;
}

export const COUNTS: CountSpec[] = [
  /*
   * Handed in and waiting on somebody.
   *
   * Deliberately left unaccepted so the demonstration has the decision in it:
   * the count was carried out by the store and cannot be signed off by the
   * store, which is the rule the whole module is arranged around.
   */
  {
    store: YARD,
    daysAgo: 1,
    status: "COUNTED",
    countedBy: "Nomsa Zulu",
    note: "Month-end count of the main yard",
    /*
     * Deliberately modest differences, except for the hard hats.
     *
     * A month-end count that is a hundred and fifty bags out is a warehouse
     * fire, not a stocktake, and a demonstration full of them teaches a reader
     * to ignore the variance column. Nine bags and a sheet of ply is what a
     * real count finds.
     *
     * The hard hats are the exception and the point: the shelf is empty and
     * the ledger says minus twelve, so the count confirms in one line what the
     * negative balance has been saying all week — twelve hats came in that
     * nobody recorded.
     */
    counted: [
      { item: "Cement 42.5N — 50kg bag", quantity: 271 },
      { item: "Y12 reinforcing bar", quantity: 2.85 },
      { item: "Shutter ply — 18mm", quantity: 11 },
      { item: "Hard hat — white", quantity: 0 },
    ],
  },
  {
    store: LOCKUP,
    daysAgo: 9,
    status: "ACCEPTED",
    countedBy: "Nomsa Zulu",
    note: "Lock-up count",
    counted: [{ item: "Shutter ply — 18mm", quantity: 37 }],
    acceptedReason: "Three sheets cut down for the site office hoarding",
  },
];

export interface InventoryDemoSummary {
  stores: number;
  items: number;
  movements: number;
  counts: number;
  putAway: number;
}

export async function seedInventoryDemo(params: {
  organisationId: string;
  userIds: Record<string, string>;
}): Promise<InventoryDemoSummary> {
  const { organisationId, userIds } = params;
  const summary: InventoryDemoSummary = {
    stores: 0,
    items: 0,
    movements: 0,
    counts: 0,
    putAway: 0,
  };

  /** A login by role key, falling back to whoever runs the company. */
  const whoever = (roleKey: string) => userIds[roleKey] ?? userIds.executive;

  // Employees and projects are looked up rather than created: this dataset
  // sits on top of the HR one and the main seed, and inventing its own people
  // would give Nopedi two sets of staff.
  const employees = await db.employee.findMany({
    select: { id: true, firstName: true, lastName: true },
  });
  const employeeIdByName = new Map(
    employees.map((employee) => [
      `${employee.firstName} ${employee.lastName}`,
      employee.id,
    ]),
  );

  const projects = await db.project.findMany({ select: { id: true, name: true } });
  const findSite = (fragment: string) =>
    (
      projects.find((project) =>
        project.name.toLowerCase().includes(fragment.toLowerCase()),
      ) ?? projects[0]
    )?.id;

  // -------------------------------------------------------------------------

  const storeIdByName = new Map<string, string>();

  for (const spec of STORES) {
    const already = await db.stockLocation.findFirst({
      where: { name: spec.name },
      select: { id: true },
    });
    if (already) {
      storeIdByName.set(spec.name, already.id);
      continue;
    }

    const store = await db.stockLocation.create({
      data: {
        organisationId,
        name: spec.name,
        projectId: spec.site ? findSite(spec.site) : undefined,
        address: spec.address,
        isDefault: spec.isDefault ?? false,
      },
    });
    storeIdByName.set(spec.name, store.id);
    summary.stores += 1;
  }

  const itemIdByName = new Map<string, string>();

  for (const spec of ITEMS) {
    const already = await db.stockItem.findFirst({
      where: { name: spec.name },
      select: { id: true },
    });
    if (already) {
      itemIdByName.set(spec.name, already.id);
      continue;
    }

    const item = await db.stockItem.create({
      data: {
        organisationId,
        reference: await nextReference("STK"),
        name: spec.name,
        code: spec.code,
        description: spec.description,
        unit: spec.unit,
        category: spec.category,
        reorderLevel: spec.reorderLevel,
        reorderQuantity: spec.reorderQuantity,
      },
    });
    itemIdByName.set(spec.name, item.id);
    summary.items += 1;
  }

  // -------------------------------------------------------------------------
  // The hand-off from procurement
  // -------------------------------------------------------------------------

  /*
   * Point existing order lines at the register, and put their deliveries away.
   *
   * The alternative — inventing purchase orders of this dataset's own — would
   * demonstrate the wrong thing. The claim is that a delivery signed for
   * against an order puts itself into the yard at the price on the order, and
   * that is only visible against the orders that are already there.
   */
  for (const spec of ITEMS) {
    if (!spec.matchOrderLine) continue;
    const stockItemId = itemIdByName.get(spec.name);
    if (!stockItemId) continue;

    const lines = await db.purchaseOrderLine.findMany({
      where: {
        stockItemId: null,
        description: { contains: spec.matchOrderLine, mode: "insensitive" },
      },
      select: { id: true, unitPriceCents: true },
    });

    for (const line of lines) {
      await db.purchaseOrderLine.update({
        where: { id: line.id },
        data: { stockItemId },
      });

      const receiptLines = await db.goodsReceiptLine.findMany({
        where: { purchaseOrderLineId: line.id },
        select: {
          quantity: true,
          goodsReceipt: {
            select: { id: true, receivedAt: true, stockLocationId: true },
          },
        },
      });

      for (const receiptLine of receiptLines) {
        const receipt = receiptLine.goodsReceipt;
        const quantity = Number(receiptLine.quantity.toString());
        if (quantity <= 0) continue;

        const toLocationId =
          receipt.stockLocationId ?? storeIdByName.get(YARD) ?? null;
        if (!toLocationId) continue;

        // Record where it was put away, so the receipt and the ledger agree
        // about which store the load went into.
        if (!receipt.stockLocationId) {
          await db.goodsReceipt.update({
            where: { id: receipt.id },
            data: { stockLocationId: toLocationId },
          });
        }

        const already = await db.stockMovement.findFirst({
          where: { goodsReceiptId: receipt.id, stockItemId },
          select: { id: true },
        });
        if (already) continue;

        await db.stockMovement.create({
          data: {
            organisationId,
            stockItemId,
            kind: "RECEIPT",
            toLocationId,
            quantity,
            unitCostCents: line.unitPriceCents,
            movedAt: receipt.receivedAt,
            goodsReceiptId: receipt.id,
            purchaseOrderLineId: line.id,
          },
        });
        summary.putAway += 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // The ledger
  // -------------------------------------------------------------------------

  for (const spec of MOVEMENTS) {
    const already = await db.stockMovement.findFirst({
      where: { note: spec.note },
      select: { id: true },
    });
    if (already) continue;

    const stockItemId = itemIdByName.get(spec.item);
    if (!stockItemId) continue;

    await db.stockMovement.create({
      data: {
        organisationId,
        stockItemId,
        kind: spec.kind,
        fromLocationId: spec.from ? storeIdByName.get(spec.from) : undefined,
        toLocationId: spec.to ? storeIdByName.get(spec.to) : undefined,
        quantity: spec.quantity,
        unitCostCents:
          spec.unitPriceRands === undefined
            ? undefined
            : BigInt(Math.round(spec.unitPriceRands * 100)),
        movedAt: daysAtHour(-spec.daysAgo, 9),
        projectId: spec.site ? findSite(spec.site) : undefined,
        issuedToEmployeeId: spec.issuedTo
          ? employeeIdByName.get(spec.issuedTo)
          : undefined,
        reason: spec.reason,
        note: spec.note,
        createdBy: whoever("storeman"),
      },
    });
    summary.movements += 1;
  }

  // -------------------------------------------------------------------------
  // Stocktakes
  // -------------------------------------------------------------------------

  for (const spec of COUNTS) {
    const already = await db.stockCount.findFirst({
      where: { note: { startsWith: spec.note } },
      select: { id: true },
    });
    if (already) continue;

    const stockLocationId = storeIdByName.get(spec.store);
    if (!stockLocationId) continue;

    const countedOn = daysAtHour(-spec.daysAgo, 7);

    const count = await db.stockCount.create({
      data: {
        organisationId,
        reference: await nextReference("SC"),
        stockLocationId,
        countedOn,
        status: spec.status,
        countedByEmployeeId: spec.countedBy
          ? employeeIdByName.get(spec.countedBy)
          : undefined,
        submittedById: whoever("storeman"),
        submittedAt: countedOn,
        acceptedById:
          spec.status === "ACCEPTED" ? whoever("finance_manager") : undefined,
        acceptedAt: spec.status === "ACCEPTED" ? daysAtHour(-spec.daysAgo + 1, 11) : undefined,
        note: spec.acceptedReason
          ? `${spec.note}\n\nAccepted: ${spec.acceptedReason}`
          : spec.note,
        createdBy: whoever("storeman"),
      },
    });
    summary.counts += 1;

    for (const line of spec.counted) {
      const stockItemId = itemIdByName.get(line.item);
      if (!stockItemId) continue;

      /*
       * What the ledger held in that store when the count was handed in.
       *
       * Replayed from the movements rather than assumed, so the variance the
       * screen shows is the real difference between the ledger and the shelf
       * rather than a figure this file made up — which is what makes the
       * demonstration worth looking at.
       */
      const movements = await db.stockMovement.findMany({
        where: { stockItemId, movedAt: { lte: countedOn } },
        select: { fromLocationId: true, toLocationId: true, quantity: true },
      });
      const expected = movements.reduce((total, movement) => {
        const quantity = Number(movement.quantity.toString());
        if (movement.toLocationId === stockLocationId) return total + quantity;
        if (movement.fromLocationId === stockLocationId) return total - quantity;
        return total;
      }, 0);

      await db.stockCountLine.create({
        data: {
          organisationId,
          stockCountId: count.id,
          stockItemId,
          countedQuantity: line.quantity,
          expectedQuantity: expected,
        },
      });

      // An accepted count has already put its difference into the ledger.
      if (spec.status !== "ACCEPTED") continue;

      const variance = line.quantity - expected;
      if (Math.abs(variance) < 0.0005) continue;

      const goingOut = variance < 0;
      await db.stockMovement.create({
        data: {
          organisationId,
          stockItemId,
          kind: goingOut ? "WRITE_OFF" : "ADJUSTMENT",
          fromLocationId: goingOut ? stockLocationId : undefined,
          toLocationId: goingOut ? undefined : stockLocationId,
          quantity: Math.abs(variance),
          movedAt: countedOn,
          stockCountId: count.id,
          reason: spec.acceptedReason ?? `Stocktake ${count.reference}`,
          note: `${spec.note} — ${line.item}`,
          createdBy: whoever("finance_manager"),
        },
      });
      summary.movements += 1;
    }
  }

  return summary;
}
