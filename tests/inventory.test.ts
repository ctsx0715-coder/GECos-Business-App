import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { crmService } from "@/modules/crm/crm.service";
import { inventoryService } from "@/modules/inventory/inventory.service";
import { procurementService } from "@/modules/procurement/procurement.service";
import { projectService } from "@/modules/projects/project.service";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * Inventory, weighted towards the rules that stop stock disappearing.
 *
 * The happy path — put a delivery away, issue it to a site, count what is left
 * — is the least interesting thing here and gets one test. The rest is the
 * separation the module exists for: a storeman who cannot write off what he
 * issued, a stocktake that the person who counted it cannot sign off, and a
 * shortfall that cannot be absorbed without somebody saying what happened to
 * it. Every one of those is a real way material walks off a construction site.
 */

let org: SeededOrg;
let customerId: string;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
  const customer = await as("executive", () =>
    crmService.createCustomer({ name: "City of Tshwane" }),
  );
  customerId = customer.id;
});

afterAll(async () => {
  await rawDb.$disconnect();
});

/** Yesterday, so nothing trips a "that has not happened yet" rule. */
function yesterday(): Date {
  return new Date(Date.now() - 86_400_000);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function aStockItem(overrides: Record<string, unknown> = {}) {
  return as("buyer", () =>
    inventoryService.createItem({
      name: "Cement 42.5N 50kg",
      unit: "bag",
      category: "MATERIALS",
      reorderLevel: 100,
      reorderQuantity: 200,
      ...overrides,
    }),
  );
}

async function aStore(name = "Main yard", extra: Record<string, unknown> = {}) {
  return as("executive", () =>
    inventoryService.createLocation({ name, isDefault: true, ...extra }),
  );
}

/**
 * Stock on the shelf, put there the way it really gets there: an approved
 * order, a delivery signed for against it, and the store named on the receipt.
 */
async function stockOnHand(
  stockItemId: string,
  stockLocationId: string,
  quantity: number,
  unitPriceRands = 125,
  projectId?: string,
) {
  const supplier = await as("buyer", () =>
    procurementService.createSupplier({ name: `PPC ${Math.random()}` }),
  );
  await as("finance_manager", () =>
    procurementService.decideSupplier({ id: supplier.id, status: "APPROVED" }),
  );

  const order = await as("buyer", () =>
    procurementService.createOrder({
      supplierId: supplier.id,
      projectId,
      lines: [
        {
          description: "Cement 42.5N 50kg",
          unit: "bag",
          quantity,
          unitPriceRands,
          category: "MATERIALS",
          stockItemId,
        },
      ],
    }),
  );
  await as("buyer", () => procurementService.submitOrder({ id: order!.id }));

  const line = order!.lines[0];
  await as("storeman", () =>
    procurementService.recordReceipt({
      purchaseOrderId: order!.id,
      receivedAt: daysAgo(10),
      stockLocationId,
      lines: [{ purchaseOrderLineId: line.id, quantity, rejectedQuantity: 0 }],
    }),
  );

  return order!;
}

describe("the register", () => {
  it("gives every item a reference and starts it at nothing", async () => {
    const item = await aStockItem();

    expect(item.reference).toMatch(/^STK-\d{4}-\d{4}$/);

    const { position, level } = await as("storeman", () =>
      inventoryService.getItem(item.id),
    );
    expect(position.quantity).toBe(0);
    expect(level).toBe("OUT");
  });

  it("keeps a reorder level nobody set as unset rather than as zero", async () => {
    const item = await aStockItem({ reorderLevel: null, reorderQuantity: null });
    const store = await aStore();
    await stockOnHand(item.id, store.id, 5);

    const { level, suggestedOrderQuantity } = await as("storeman", () =>
      inventoryService.getItem(item.id),
    );

    // Five bags is below any level anybody would have set. Nobody set one, so
    // this must not appear on a buyer's list.
    expect(level).toBe("UNSET");
    expect(suggestedOrderQuantity).toBeNull();
  });

  it("will not let a storeman edit the register", async () => {
    await expect(
      as("storeman", () => inventoryService.createItem({ name: "Sand" })),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("stores", () => {
  it("keeps exactly one default, so a delivery has one place to land", async () => {
    const yard = await aStore("Main yard");
    const site = await as("executive", () =>
      inventoryService.createLocation({ name: "Mamelodi site store", isDefault: true }),
    );

    const stores = await as("storeman", () => inventoryService.listLocations());
    const defaults = stores.filter((store) => store.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(site.id);
    expect(stores.find((store) => store.id === yard.id)!.isDefault).toBe(false);
  });

  it("will not let a storeman open one", async () => {
    await expect(
      as("storeman", () => inventoryService.createLocation({ name: "Container 3" })),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("putting a delivery away", () => {
  it("moves stock into the store the receipt names, at the order's price", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 400, 125);

    const { position } = await as("storeman", () =>
      inventoryService.getItem(item.id),
    );

    expect(position.quantity).toBe(400);
    expect(position.unitCostCents).toBe(125_00);
    expect(position.valueCents).toBe(400 * 125_00);
    expect(position.byLocation.get(store.id)).toBe(400);
  });

  it("puts nothing away when the delivery never went into a store", async () => {
    // Readymix off the truck and straight onto the slab. It was bought and it
    // was delivered, and it was never in a yard.
    const item = await aStockItem({ name: "Ready-mix 25MPa", unit: "m³" });
    await aStore();

    const supplier = await as("buyer", () =>
      procurementService.createSupplier({ name: "Afrimat" }),
    );
    await as("finance_manager", () =>
      procurementService.decideSupplier({ id: supplier.id, status: "APPROVED" }),
    );
    const order = await as("buyer", () =>
      procurementService.createOrder({
        supplierId: supplier.id,
        lines: [
          {
            description: "Ready-mix 25MPa",
            unit: "m³",
            quantity: 12,
            unitPriceRands: 1450,
            stockItemId: item.id,
          },
        ],
      }),
    );
    await as("buyer", () => procurementService.submitOrder({ id: order!.id }));
    await as("storeman", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order!.id,
        receivedAt: yesterday(),
        lines: [
          { purchaseOrderLineId: order!.lines[0].id, quantity: 12, rejectedQuantity: 0 },
        ],
      }),
    );

    const { position } = await as("storeman", () =>
      inventoryService.getItem(item.id),
    );
    expect(position.quantity).toBe(0);
  });

  it("ignores a line that buys something nobody holds stock of", async () => {
    // Plant hire is an ordinary order line and never sits on a shelf.
    const store = await aStore();
    const supplier = await as("buyer", () =>
      procurementService.createSupplier({ name: "Babcock" }),
    );
    await as("finance_manager", () =>
      procurementService.decideSupplier({ id: supplier.id, status: "APPROVED" }),
    );
    const order = await as("buyer", () =>
      procurementService.createOrder({
        supplierId: supplier.id,
        lines: [
          {
            description: "Compactor hire",
            unit: "day",
            quantity: 14,
            unitPriceRands: 900,
            category: "PLANT",
          },
        ],
      }),
    );
    await as("buyer", () => procurementService.submitOrder({ id: order!.id }));
    await as("storeman", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order!.id,
        receivedAt: yesterday(),
        stockLocationId: store.id,
        lines: [
          { purchaseOrderLineId: order!.lines[0].id, quantity: 14, rejectedQuantity: 0 },
        ],
      }),
    );

    const positions = await as("storeman", () => inventoryService.listPositions());
    expect(positions).toHaveLength(0);
  });

  it("puts away what was accepted, not what the driver brought", async () => {
    const item = await aStockItem();
    const store = await aStore();

    const supplier = await as("buyer", () =>
      procurementService.createSupplier({ name: "PPC" }),
    );
    await as("finance_manager", () =>
      procurementService.decideSupplier({ id: supplier.id, status: "APPROVED" }),
    );
    const order = await as("buyer", () =>
      procurementService.createOrder({
        supplierId: supplier.id,
        lines: [
          {
            description: "Cement 42.5N 50kg",
            unit: "bag",
            quantity: 100,
            unitPriceRands: 125,
            stockItemId: item.id,
          },
        ],
      }),
    );
    await as("buyer", () => procurementService.submitOrder({ id: order!.id }));
    await as("storeman", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order!.id,
        receivedAt: yesterday(),
        stockLocationId: store.id,
        lines: [
          {
            purchaseOrderLineId: order!.lines[0].id,
            quantity: 88,
            rejectedQuantity: 12,
            rejectedReason: "Torn bags, wet",
          },
        ],
      }),
    );

    const { position } = await as("storeman", () =>
      inventoryService.getItem(item.id),
    );
    // The twelve torn bags went back on the truck. They were never in the yard.
    expect(position.quantity).toBe(88);
  });
});

describe("issuing", () => {
  it("takes stock out of the store and puts it against a job", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 400);

    const project = await as("executive", () =>
      projectService.create({ name: "Mamelodi clinic", customerId }),
    );

    const result = await as("storeman", () =>
      inventoryService.issue({
        stockItemId: item.id,
        fromLocationId: store.id,
        quantity: 120,
        movedAt: yesterday(),
        projectId: project.id,
      }),
    );

    expect(result.onHandHere).toBe(280);
    expect(result.position.quantity).toBe(280);
  });

  it("lets an issue go below zero rather than losing the record of it", async () => {
    // Forty bags are going out of a store the ledger says holds thirty. The
    // yard is not wrong — a delivery has not been captured. Refusing this
    // means the storeman records nothing at all, and then the ledger is wrong
    // and nobody knows it.
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 30);

    const result = await as("storeman", () =>
      inventoryService.issue({
        stockItemId: item.id,
        fromLocationId: store.id,
        quantity: 40,
        movedAt: yesterday(),
      }),
    );

    expect(result.position.quantity).toBe(-10);
    expect(result.concerns[0]).toContain("never recorded");
  });

  it("brings returned material back onto the shelf at the price we knew", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 100, 125);

    await as("storeman", () =>
      inventoryService.issue({
        stockItemId: item.id,
        fromLocationId: store.id,
        quantity: 100,
        movedAt: daysAgo(2),
      }),
    );
    const result = await as("storeman", () =>
      inventoryService.returnToStore({
        stockItemId: item.id,
        toLocationId: store.id,
        quantity: 20,
        movedAt: yesterday(),
      }),
    );

    expect(result.position.quantity).toBe(20);
    // Not zero. Material coming back off a site carries no price, and valuing
    // it at nothing writes it off on the way in.
    expect(result.position.valueCents).toBe(20 * 125_00);
  });

  it("will not let somebody without the permission issue anything", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 100);

    await expect(
      as("finance_manager", () =>
        inventoryService.issue({
          stockItemId: item.id,
          fromLocationId: store.id,
          quantity: 10,
          movedAt: yesterday(),
        }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("transfers", () => {
  it("moves stock between stores without consuming or buying any", async () => {
    const item = await aStockItem();
    const yard = await aStore("Main yard");
    const site = await as("executive", () =>
      inventoryService.createLocation({ name: "Mamelodi site store" }),
    );
    await stockOnHand(item.id, yard.id, 500, 125);

    await as("storeman", () =>
      inventoryService.transfer({
        stockItemId: item.id,
        fromLocationId: yard.id,
        toLocationId: site.id,
        quantity: 200,
        movedAt: yesterday(),
      }),
    );

    const { position } = await as("storeman", () =>
      inventoryService.getItem(item.id),
    );
    expect(position.quantity).toBe(500);
    expect(position.byLocation.get(yard.id)).toBe(300);
    expect(position.byLocation.get(site.id)).toBe(200);
    expect(position.valueCents).toBe(500 * 125_00);
  });

  it("refuses a transfer out of a store that does not hold it", async () => {
    // Unlike an issue, a transfer is administration rather than a physical
    // event that has already happened, and the usual cause of one going
    // negative is the wrong store picked off a list.
    const item = await aStockItem();
    const yard = await aStore("Main yard");
    const site = await as("executive", () =>
      inventoryService.createLocation({ name: "Mamelodi site store" }),
    );
    await stockOnHand(item.id, yard.id, 50);

    await expect(
      as("storeman", () =>
        inventoryService.transfer({
          stockItemId: item.id,
          fromLocationId: site.id,
          toLocationId: yard.id,
          quantity: 20,
          movedAt: yesterday(),
        }),
      ),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe("the separation that the module exists for", () => {
  it("does not let the storeman who issues stock write it off", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 400);

    await expect(
      as("storeman", () =>
        inventoryService.adjust({
          stockItemId: item.id,
          locationId: store.id,
          quantity: -50,
          kind: "WRITE_OFF",
          movedAt: yesterday(),
          reason: "Damaged",
        }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets somebody who holds the narrow permission correct the ledger", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 400);

    const result = await as("finance_manager", () =>
      inventoryService.adjust({
        stockItemId: item.id,
        locationId: store.id,
        quantity: -50,
        kind: "WRITE_OFF",
        movedAt: yesterday(),
        reason: "Water damage in the container",
      }),
    );

    expect(result.position.quantity).toBe(350);
  });

  it("will not take an adjustment with no reason on it", async () => {
    const item = await aStockItem();
    const store = await aStore();

    await expect(
      as("finance_manager", () =>
        inventoryService.adjust({
          stockItemId: item.id,
          locationId: store.id,
          quantity: -10,
          movedAt: yesterday(),
        }),
      ),
    ).rejects.toThrow();
  });

  it("will not let a write-off put stock in", async () => {
    const item = await aStockItem();
    const store = await aStore();

    await expect(
      as("finance_manager", () =>
        inventoryService.adjust({
          stockItemId: item.id,
          locationId: store.id,
          quantity: 10,
          kind: "WRITE_OFF",
          movedAt: yesterday(),
          reason: "Found behind the door",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("stocktakes", () => {
  async function aCountedStore(counted: number, held = 400) {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, held);

    const count = await as("storeman", () =>
      inventoryService.startCount({
        stockLocationId: store.id,
        countedOn: yesterday(),
      }),
    );
    await as("storeman", () =>
      inventoryService.recordCountLines({
        id: count.id,
        lines: [{ stockItemId: item.id, countedQuantity: counted }],
      }),
    );

    return { item, store, count };
  }

  it("freezes what the ledger said when the count was handed in", async () => {
    const { item, store, count } = await aCountedStore(374);

    await as("storeman", () => inventoryService.submitCount({ id: count.id }));

    // The yard carries on working after the count is handed in. The variance
    // somebody is being asked to accept must not move under them.
    await as("storeman", () =>
      inventoryService.issue({
        stockItemId: item.id,
        fromLocationId: store.id,
        quantity: 100,
        movedAt: yesterday(),
      }),
    );

    const after = await as("finance_manager", () =>
      inventoryService.getCount(count.id),
    );
    expect(Number(after.lines[0].expectedQuantity)).toBe(400);
    expect(after.variance.lines[0].varianceQuantity).toBe(-26);
  });

  it("refuses to be counted again once it has been handed in", async () => {
    const { item, count } = await aCountedStore(374);
    await as("storeman", () => inventoryService.submitCount({ id: count.id }));

    await expect(
      as("storeman", () =>
        inventoryService.recordCountLines({
          id: count.id,
          lines: [{ stockItemId: item.id, countedQuantity: 400 }],
        }),
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("does not let the person who handed a count in accept it", async () => {
    const { count } = await aCountedStore(374);
    await as("storeman", () => inventoryService.submitCount({ id: count.id }));

    // The executive holds every permission, including the one to accept. What
    // stops them here is having carried the count out themselves.
    const own = await as("executive", () =>
      inventoryService.startCount({
        stockLocationId: count.stockLocationId,
        countedOn: yesterday(),
      }),
    );
    const item = await aStockItem({ name: "Sand" });
    await as("executive", () =>
      inventoryService.recordCountLines({
        id: own.id,
        lines: [{ stockItemId: item.id, countedQuantity: 3 }],
      }),
    );
    await as("executive", () => inventoryService.submitCount({ id: own.id }));

    await expect(
      as("executive", () => inventoryService.acceptCount({ id: own.id })),
    ).rejects.toThrow(ForbiddenError);
  });

  it("will not absorb a shortfall without somebody saying what happened", async () => {
    const { count } = await aCountedStore(374);
    await as("storeman", () => inventoryService.submitCount({ id: count.id }));

    await expect(
      as("finance_manager", () => inventoryService.acceptCount({ id: count.id })),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("writes the variance into the ledger when it is accepted", async () => {
    const { item, store, count } = await aCountedStore(374);
    await as("storeman", () => inventoryService.submitCount({ id: count.id }));

    await as("finance_manager", () =>
      inventoryService.acceptCount({
        id: count.id,
        reason: "Twenty-six bags unaccounted for; site access under review",
      }),
    );

    const { position, movements } = await as("storeman", () =>
      inventoryService.getItem(item.id),
    );

    // The ledger now agrees with the shelf, and it agrees because of a
    // write-off somebody signed rather than because a number was edited.
    expect(position.byLocation.get(store.id)).toBe(374);
    expect(movements.some((movement) => movement.kind === "WRITE_OFF")).toBe(true);
  });

  it("writes nothing for a line that agreed", async () => {
    const { item, count } = await aCountedStore(400);
    await as("storeman", () => inventoryService.submitCount({ id: count.id }));
    await as("finance_manager", () =>
      inventoryService.acceptCount({ id: count.id }),
    );

    const { movements } = await as("storeman", () =>
      inventoryService.getItem(item.id),
    );
    // A movement of zero is not an event, and a ledger full of them buries the
    // ones that matter.
    expect(movements.filter((movement) => movement.stockCountId !== null)).toEqual([]);
  });

  it("cannot be accepted twice", async () => {
    const { count } = await aCountedStore(400);
    await as("storeman", () => inventoryService.submitCount({ id: count.id }));
    await as("finance_manager", () =>
      inventoryService.acceptCount({ id: count.id }),
    );

    await expect(
      as("finance_manager", () => inventoryService.acceptCount({ id: count.id })),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("will not let a counter withdraw a count somebody is already checking", async () => {
    const { count } = await aCountedStore(374);
    await as("storeman", () => inventoryService.submitCount({ id: count.id }));

    await expect(
      as("storeman", () =>
        inventoryService.abandonCount({ id: count.id, reason: "Ran out of time" }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets a counter give up on one nobody has looked at yet", async () => {
    const { count } = await aCountedStore(374);

    const abandoned = await as("storeman", () =>
      inventoryService.abandonCount({
        id: count.id,
        reason: "Rain stopped the count",
      }),
    );
    expect(abandoned.status).toBe("ABANDONED");
  });
});

describe("what a project has drawn", () => {
  it("values what was issued and takes returns back off it", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 500, 125);

    const project = await as("executive", () =>
      projectService.create({ name: "Mamelodi clinic", customerId }),
    );

    await as("storeman", () =>
      inventoryService.issue({
        stockItemId: item.id,
        fromLocationId: store.id,
        quantity: 120,
        movedAt: daysAgo(3),
        projectId: project.id,
      }),
    );
    await as("storeman", () =>
      inventoryService.returnToStore({
        stockItemId: item.id,
        toLocationId: store.id,
        quantity: 20,
        movedAt: yesterday(),
        projectId: project.id,
      }),
    );

    const drawn = await as("project_manager", () =>
      inventoryService.issuedTo(project.id),
    );

    expect(drawn.valueCents).toBe(100 * 125_00);
  });

  it("has nothing to say about a project nothing was drawn for", async () => {
    const project = await as("executive", () =>
      projectService.create({ name: "Soshanguve depot", customerId }),
    );

    const drawn = await as("project_manager", () =>
      inventoryService.issuedTo(project.id),
    );
    expect(drawn.valueCents).toBe(0);
    expect(drawn.movements).toEqual([]);
  });
});

describe("the overview", () => {
  it("leads with a ledger that says less than nothing", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 30);
    await as("storeman", () =>
      inventoryService.issue({
        stockItemId: item.id,
        fromLocationId: store.id,
        quantity: 40,
        movedAt: yesterday(),
      }),
    );

    const overview = await as("storeman", () => inventoryService.overview());

    expect(overview.impossible).toHaveLength(1);
    expect(overview.impossible[0].item.id).toBe(item.id);
  });

  it("lists what is running low with something a buyer can order", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 500);
    await as("storeman", () =>
      inventoryService.issue({
        stockItemId: item.id,
        fromLocationId: store.id,
        quantity: 440,
        movedAt: yesterday(),
      }),
    );

    const overview = await as("buyer", () => inventoryService.overview());

    expect(overview.low).toHaveLength(1);
    expect(overview.low[0].suggestedOrderQuantity).toBe(240);
  });

  it("tells a storeman what they may do, and a buyer what they may not", async () => {
    await aStockItem();
    await aStore();

    const forStoreman = await as("storeman", () => inventoryService.overview());
    expect(forStoreman.canIssue).toBe(true);
    expect(forStoreman.canAdjust).toBe(false);

    const forBuyer = await as("buyer", () => inventoryService.overview());
    expect(forBuyer.canIssue).toBe(false);
    expect(forBuyer.canCount).toBe(false);
  });

  it("is not readable by somebody with no inventory permission at all", async () => {
    await expect(
      as("employee", () => inventoryService.overview()),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("tenancy", () => {
  it("does not show one organisation's stock to another", async () => {
    const item = await aStockItem();
    const store = await aStore();
    await stockOnHand(item.id, store.id, 400);

    const other = await seedOrganisation("Rival Civils");

    const theirs = await withRequestContext(
      { organisationId: other.organisationId, userId: other.userIds.executive },
      () => inventoryService.listPositions(),
    );
    expect(theirs).toEqual([]);

    await expect(
      withRequestContext(
        { organisationId: other.organisationId, userId: other.userIds.executive },
        () => inventoryService.getItem(item.id),
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("a store's week, end to end", () => {
  it("survives a delivery, an issue, a transfer, a count and a write-off", async () => {
    const item = await aStockItem();
    const yard = await aStore("Main yard");
    const site = await as("executive", () =>
      inventoryService.createLocation({ name: "Mamelodi site store" }),
    );
    const project = await as("executive", () =>
      projectService.create({ name: "Mamelodi clinic", customerId }),
    );

    await stockOnHand(item.id, yard.id, 500, 125);

    await as("storeman", () =>
      inventoryService.issue({
        stockItemId: item.id,
        fromLocationId: yard.id,
        quantity: 120,
        movedAt: daysAgo(4),
        projectId: project.id,
      }),
    );
    await as("storeman", () =>
      inventoryService.transfer({
        stockItemId: item.id,
        fromLocationId: yard.id,
        toLocationId: site.id,
        quantity: 200,
        movedAt: daysAgo(3),
      }),
    );

    const count = await as("storeman", () =>
      inventoryService.startCount({
        stockLocationId: yard.id,
        countedOn: daysAgo(1),
      }),
    );
    await as("storeman", () =>
      inventoryService.recordCountLines({
        id: count.id,
        lines: [{ stockItemId: item.id, countedQuantity: 174 }],
      }),
    );
    await as("storeman", () => inventoryService.submitCount({ id: count.id }));
    await as("finance_manager", () =>
      inventoryService.acceptCount({
        id: count.id,
        reason: "Six bags split and swept up",
      }),
    );

    const { position } = await as("storeman", () =>
      inventoryService.getItem(item.id),
    );

    // 500 in, 120 issued, 200 moved to site, 6 written off in the yard.
    expect(position.byLocation.get(yard.id)).toBe(174);
    expect(position.byLocation.get(site.id)).toBe(200);
    expect(position.quantity).toBe(374);

    // Every bag is in one of the two stores, and the two figures agree.
    const stored = [...position.byLocation.values()].reduce((a, b) => a + b, 0);
    expect(stored).toBe(position.quantity);
  });
});
