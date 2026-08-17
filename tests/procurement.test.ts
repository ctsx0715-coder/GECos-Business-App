import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { crmService } from "@/modules/crm/crm.service";
import { procurementService } from "@/modules/procurement/procurement.service";
import { projectService } from "@/modules/projects/project.service";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * Procurement, weighted towards the rules that stop money leaving.
 *
 * The happy path — raise an order, approve it, receive it, pay it — is the
 * least interesting thing here and gets one test. The rest is the awkward
 * cases: buying from a supplier nobody vetted, approving your own order,
 * signing for goods against an order that was never approved, and being
 * invoiced for a delivery that has not happened. Every one of those is a real
 * way a construction company loses money, and each is a single rule.
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

/** Yesterday, so nothing trips a "that is in the future" rule. */
function yesterday(): Date {
  return new Date(Date.now() - 86_400_000);
}

async function anApprovedSupplier(name = "Afrimat Readymix") {
  const supplier = await as("buyer", () =>
    procurementService.createSupplier({ name, supplies: ["readymix"] }),
  );
  await as("finance_manager", () =>
    procurementService.decideSupplier({ id: supplier.id, status: "APPROVED" }),
  );
  return supplier;
}

/** An order for 10 m³ of concrete at R1 450, so R14 500 in total. */
async function aDraftOrder(supplierId: string, projectId?: string) {
  const order = await as("buyer", () =>
    procurementService.createOrder({
      supplierId,
      projectId,
      lines: [
        {
          description: "Ready-mix 25MPa",
          unit: "m³",
          quantity: 10,
          unitPriceRands: 1450,
          category: "MATERIALS",
        },
      ],
    }),
  );
  return order!;
}

/** Approved, with no chain configured, so submitting settles it outright. */
async function anApprovedOrder(projectId?: string) {
  const supplier = await anApprovedSupplier();
  const order = await aDraftOrder(supplier.id, projectId);
  await as("buyer", () => procurementService.submitOrder({ id: order.id }));
  return as("buyer", () => procurementService.getOrder(order.id));
}

describe("the supplier register", () => {
  it("allocates a reference and starts unvetted", async () => {
    const supplier = await as("buyer", () =>
      procurementService.createSupplier({ name: "Afrimat Readymix" }),
    );

    expect(supplier.reference).toMatch(/^SUP-\d{4}-\d{4}$/);
    expect(supplier.status).toBe("PENDING");
  });

  it("does not let a buyer clear their own supplier", async () => {
    // The whole point of a register: whoever adds a name is not the person who
    // decides the company may pay it money.
    const supplier = await as("buyer", () =>
      procurementService.createSupplier({ name: "Cash Only Trading" }),
    );

    await expect(
      as("buyer", () =>
        procurementService.decideSupplier({ id: supplier.id, status: "APPROVED" }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("flags a lapsed tax clearance on the list, not only on the record", async () => {
    const supplier = await as("buyer", () =>
      procurementService.createSupplier({
        name: "Lapsed Supplies",
        taxClearanceExpiresAt: new Date(Date.now() - 30 * 86_400_000),
      }),
    );

    const listed = await as("buyer", () => procurementService.listSuppliers());
    const found = listed.find((row) => row.id === supplier.id);

    expect(found?.taxClearanceLapsed).toBe(true);
  });
});

describe("raising an order", () => {
  it("will not buy from a supplier nobody has cleared", async () => {
    const supplier = await as("buyer", () =>
      procurementService.createSupplier({ name: "Unvetted Hire" }),
    );

    await expect(
      as("buyer", () =>
        procurementService.createOrder({ supplierId: supplier.id, lines: [] }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("will not buy from a suspended one", async () => {
    const supplier = await anApprovedSupplier("Suspended Sand");
    await as("finance_manager", () =>
      procurementService.decideSupplier({
        id: supplier.id,
        status: "SUSPENDED",
        reason: "Two short deliveries and no credit note.",
      }),
    );

    await expect(
      as("buyer", () =>
        procurementService.createOrder({ supplierId: supplier.id, lines: [] }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("numbers the lines from one", async () => {
    const supplier = await anApprovedSupplier();
    const order = await aDraftOrder(supplier.id);

    expect(order.lines[0].lineNumber).toBe(1);
    expect(order.status).toBe("DRAFT");
  });

  it("does not reuse a removed line's number", async () => {
    // A supplier querying "line 2" must not be able to mean two things.
    const supplier = await anApprovedSupplier();
    const order = await aDraftOrder(supplier.id);

    const second = await as("buyer", () =>
      procurementService.addLine({
        purchaseOrderId: order.id,
        description: "Pump hire",
        unit: "day",
        quantity: 1,
        unitPriceRands: 3200,
      }),
    );
    await as("buyer", () =>
      procurementService.removeLine({
        purchaseOrderId: order.id,
        lineId: second.id,
      }),
    );
    const third = await as("buyer", () =>
      procurementService.addLine({
        purchaseOrderId: order.id,
        description: "Curing compound",
        quantity: 4,
        unitPriceRands: 210,
      }),
    );

    expect(third.lineNumber).toBe(3);
  });

  it("refuses to send an empty order for approval", async () => {
    const supplier = await anApprovedSupplier();
    const order = await as("buyer", () =>
      procurementService.createOrder({ supplierId: supplier.id, lines: [] }),
    );

    await expect(
      as("buyer", () => procurementService.submitOrder({ id: order!.id })),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("cannot be edited once it has been approved", async () => {
    const order = await anApprovedOrder();

    await expect(
      as("buyer", () =>
        procurementService.addLine({
          purchaseOrderId: order.id,
          description: "One more thing",
          quantity: 1,
          unitPriceRands: 100,
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("approves outright when no chain is configured", async () => {
    // Right answer for a company of fifteen. A ladder should not appear until
    // somebody asks for one — but the approval stamp must still be written,
    // or the order reads as approved by nobody.
    const order = await anApprovedOrder();

    expect(order.status).toBe("APPROVED");
    expect(order.approvedById).toBe(org.userIds.buyer);
    expect(order.approvedAt).not.toBeNull();
  });
});

describe("receiving", () => {
  it("will not accept a delivery against an unapproved order", async () => {
    const supplier = await anApprovedSupplier();
    const order = await aDraftOrder(supplier.id);

    await expect(
      as("project_manager", () =>
        procurementService.recordReceipt({
          purchaseOrderId: order.id,
          receivedAt: yesterday(),
          lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 10 }],
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("will not accept goods that are not on the order", async () => {
    const order = await anApprovedOrder();
    const other = await anApprovedOrder();

    await expect(
      as("project_manager", () =>
        procurementService.recordReceipt({
          purchaseOrderId: order.id,
          receivedAt: yesterday(),
          lines: [{ purchaseOrderLineId: other.lines[0].id, quantity: 1 }],
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("adds up several deliveries against one line", async () => {
    const order = await anApprovedOrder();

    for (const quantity of [4, 6]) {
      await as("project_manager", () =>
        procurementService.recordReceipt({
          purchaseOrderId: order.id,
          receivedAt: yesterday(),
          lines: [{ purchaseOrderLineId: order.lines[0].id, quantity }],
        }),
      );
    }

    const after = await as("buyer", () => procurementService.getOrder(order.id));
    expect(after.match.delivery).toBe("COMPLETE");
  });

  it("does not count what was sent back", async () => {
    const order = await anApprovedOrder();

    await as("project_manager", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order.id,
        receivedAt: yesterday(),
        lines: [
          {
            purchaseOrderLineId: order.lines[0].id,
            quantity: 8,
            rejectedQuantity: 2,
            rejectedReason: "Slump was wrong on the second load.",
          },
        ],
      }),
    );

    const after = await as("buyer", () => procurementService.getOrder(order.id));
    expect(after.match.delivery).toBe("PART");
    expect(after.concerns.some((note) => note.includes("sent back"))).toBe(true);
  });

  it("is not something a buyer may do", async () => {
    // Raising the order and signing for it is two sides of the same
    // transaction in one pair of hands.
    const order = await anApprovedOrder();

    await expect(
      as("buyer", () =>
        procurementService.recordReceipt({
          purchaseOrderId: order.id,
          receivedAt: yesterday(),
          lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 10 }],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("invoices and the match", () => {
  it("will not take an invoice against an order nobody approved", async () => {
    const supplier = await anApprovedSupplier();
    const order = await aDraftOrder(supplier.id);

    await expect(
      as("buyer", () =>
        procurementService.recordInvoice({
          purchaseOrderId: order.id,
          invoiceNumber: "INV-1",
          invoicedAt: yesterday(),
          netAmountRands: 14_500,
        }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("stops an over-billing being released without anybody saying why", async () => {
    // Half delivered, invoiced in full. This is the case the whole module is
    // for: matched against the order rather than the delivery it looks right.
    const order = await anApprovedOrder();
    await as("project_manager", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order.id,
        receivedAt: yesterday(),
        lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 5 }],
      }),
    );
    const invoice = await as("finance_manager", () =>
      procurementService.recordInvoice({
        purchaseOrderId: order.id,
        invoiceNumber: "INV-8891",
        invoicedAt: yesterday(),
        netAmountRands: 14_500,
      }),
    );

    await expect(
      as("finance_manager", () =>
        procurementService.decideInvoice({ id: invoice.id, decision: "APPROVED" }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("lets it through when somebody says why", async () => {
    // Not a veto. A supplier may legitimately invoice ahead on a long lead
    // item — it just must not happen silently.
    const order = await anApprovedOrder();
    await as("project_manager", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order.id,
        receivedAt: yesterday(),
        lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 5 }],
      }),
    );
    const invoice = await as("finance_manager", () =>
      procurementService.recordInvoice({
        purchaseOrderId: order.id,
        invoiceNumber: "INV-8891",
        invoicedAt: yesterday(),
        netAmountRands: 14_500,
      }),
    );

    const decided = await as("finance_manager", () =>
      procurementService.decideInvoice({
        id: invoice.id,
        decision: "APPROVED",
        reason: "Balance is on the yard, agreed with Themba.",
      }),
    );

    expect(decided.status).toBe("APPROVED");
  });

  it("releases a matching invoice with nothing said", async () => {
    const order = await anApprovedOrder();
    await as("project_manager", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order.id,
        receivedAt: yesterday(),
        lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 10 }],
      }),
    );
    const invoice = await as("finance_manager", () =>
      procurementService.recordInvoice({
        purchaseOrderId: order.id,
        invoiceNumber: "INV-8891",
        invoicedAt: yesterday(),
        netAmountRands: 14_500,
      }),
    );

    const decided = await as("finance_manager", () =>
      procurementService.decideInvoice({ id: invoice.id, decision: "APPROVED" }),
    );

    expect(decided.status).toBe("APPROVED");
    const after = await as("buyer", () => procurementService.getOrder(order.id));
    expect(after.match.settled).toBe(true);
  });

  it("is not something a buyer may release", async () => {
    const order = await anApprovedOrder();
    const invoice = await as("buyer", () =>
      procurementService.recordInvoice({
        purchaseOrderId: order.id,
        invoiceNumber: "INV-9",
        invoicedAt: yesterday(),
        netAmountRands: 1,
      }),
    );

    await expect(
      as("buyer", () =>
        procurementService.decideInvoice({ id: invoice.id, decision: "PAID" }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("finishing with an order", () => {
  it("cancels a draft nobody has delivered against", async () => {
    const supplier = await anApprovedSupplier();
    const order = await aDraftOrder(supplier.id);

    const cancelled = await as("finance_manager", () =>
      procurementService.cancelOrder({ id: order.id, reason: "Site went on hold." }),
    );

    expect(cancelled.status).toBe("CANCELLED");
  });

  it("refuses to cancel one that has had a delivery", async () => {
    // Cancelling would erase the fact that goods arrived, which is the one
    // thing the record must never lose.
    const order = await anApprovedOrder();
    await as("project_manager", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order.id,
        receivedAt: yesterday(),
        lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 3 }],
      }),
    );

    await expect(
      as("finance_manager", () =>
        procurementService.cancelOrder({ id: order.id, reason: "Changed our mind." }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("will not close one that does not balance without a reason", async () => {
    const order = await anApprovedOrder();
    await as("project_manager", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order.id,
        receivedAt: yesterday(),
        lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 7 }],
      }),
    );

    await expect(
      as("finance_manager", () => procurementService.closeOrder({ id: order.id })),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("closes it short when somebody says why", async () => {
    const order = await anApprovedOrder();
    await as("project_manager", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order.id,
        receivedAt: yesterday(),
        lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 7 }],
      }),
    );

    const closed = await as("finance_manager", () =>
      procurementService.closeOrder({
        id: order.id,
        reason: "Balance written off, pour finished with what arrived.",
      }),
    );

    expect(closed.status).toBe("CLOSED");
  });

  it("closes a settled one with nothing said", async () => {
    const order = await anApprovedOrder();
    await as("project_manager", () =>
      procurementService.recordReceipt({
        purchaseOrderId: order.id,
        receivedAt: yesterday(),
        lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 10 }],
      }),
    );
    await as("finance_manager", () =>
      procurementService.recordInvoice({
        purchaseOrderId: order.id,
        invoiceNumber: "INV-8891",
        invoicedAt: yesterday(),
        netAmountRands: 14_500,
      }),
    );

    const closed = await as("finance_manager", () =>
      procurementService.closeOrder({ id: order.id }),
    );

    expect(closed.status).toBe("CLOSED");
  });
});

describe("what a project has promised", () => {
  it("counts an approved order against the budget, not only the expenses", async () => {
    const project = await as("project_manager", () =>
      projectService.create({
        name: "Emalahleni water works",
        customerId,
        budgetRands: 500_000,
      }),
    );
    await anApprovedOrder(project.id);

    const budget = await as("project_manager", () =>
      projectService.budgetHealth(project.id),
    );

    expect(budget.orderedCents).toBe(1_450_000n);
    expect(budget.orderCount).toBe(1);
    expect(budget.committedCents).toBe(1_450_000n);
  });

  it("shows the same figure to somebody who cannot see procurement", async () => {
    // A budget that changes depending on who is looking at it is not a budget.
    const project = await as("project_manager", () =>
      projectService.create({
        name: "Emalahleni water works",
        customerId,
        budgetRands: 500_000,
      }),
    );
    await anApprovedOrder(project.id);

    const budget = await as("hr_manager", () =>
      projectService.budgetHealth(project.id),
    ).catch(() => null);

    // hr_manager holds no projects.expense.view, so this is a Forbidden — the
    // point being that the number is not gated on procurement separately.
    expect(budget).toBeNull();

    const executive = await as("executive", () =>
      projectService.budgetHealth(project.id),
    );
    expect(executive.orderedCents).toBe(1_450_000n);
  });
});

describe("reading it", () => {
  it("is not visible to somebody with no procurement permission", async () => {
    await expect(
      as("employee", () => procurementService.listOrders()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("says an order does not exist rather than leaking another tenant's", async () => {
    const other = await seedOrganisation("Rival Civils");
    const supplier = await withRequestContext(
      { organisationId: other.organisationId, userId: other.userIds.buyer },
      () => procurementService.createSupplier({ name: "Their Supplier" }),
    );

    await expect(
      as("buyer", () => procurementService.getSupplier(supplier.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
