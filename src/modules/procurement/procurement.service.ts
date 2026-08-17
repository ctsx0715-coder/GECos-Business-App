import { db } from "@/lib/database/client";
import { nextReference } from "@/lib/database/reference-numbers";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  approvalTrailFor,
  decide,
  pendingApprovalFor,
  startWorkflow,
} from "@/lib/workflows/engine";
import {
  addOrderLineSchema,
  cancelOrderSchema,
  closeOrderSchema,
  createOrderSchema,
  invoiceDecisionSchema,
  orderDecisionSchema,
  recordInvoiceSchema,
  recordReceiptSchema,
  removeOrderLineSchema,
  submitOrderSchema,
  supplierDecisionSchema,
  supplierSchema,
  updateOrderSchema,
  updateSupplierSchema,
} from "@/schemas/procurement.schema";
import type {
  PurchaseOrderStatus,
  SupplierStatus,
} from "@/generated/prisma/client";
import { procurementRepository } from "./procurement.repository";
import {
  concerns,
  lineValueCents,
  matchOrder,
  type InvoicedAmount,
  type OrderMatch,
  type OrderedLine,
  type ReceivedAgainstLine,
} from "./matching";

/**
 * Procurement.
 *
 * Three rules carry the module, and all three are about keeping the sides of a
 * transaction in different hands.
 *
 * An order becomes a commitment at APPROVED and not before, so nothing here
 * lets an order be approved by the person who raised it. Goods can only be
 * received against a line that was actually ordered. And an invoice is
 * released for payment against what arrived, never against what was ordered —
 * that comparison is the one thing standing between the company and paying for
 * a delivery still sitting on the supplier's yard.
 *
 * The arithmetic is all in `matching.ts`, with no database in it. What is here
 * is who may do what, and in what order.
 */

/** Rands off a form become cents once, here, and are never floats again. */
function toCents(rands: number): bigint {
  return BigInt(Math.round(rands * 100));
}

/** Prisma hands quantities back as Decimal; the match works in numbers. */
function toNumber(value: { toString(): string }): number {
  return Number(value.toString());
}

type OrderRow = NonNullable<
  Awaited<ReturnType<typeof procurementRepository.findOrder>>
>;

/** Shapes a loaded order into the three documents the match compares. */
function documentsOf(order: OrderRow): {
  lines: OrderedLine[];
  receipts: ReceivedAgainstLine[];
  invoices: InvoicedAmount[];
} {
  return {
    lines: order.lines.map((line) => ({
      id: line.id,
      description: line.description,
      unit: line.unit,
      quantity: toNumber(line.quantity),
      unitPriceCents: Number(line.unitPriceCents),
    })),
    receipts: order.receipts.flatMap((receipt) =>
      receipt.lines.map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        quantity: toNumber(line.quantity),
        rejectedQuantity: toNumber(line.rejectedQuantity),
      })),
    ),
    invoices: order.invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      netAmountCents: Number(invoice.netAmountCents),
      disputed: invoice.status === "DISPUTED",
    })),
  };
}

/** An order with its match and the plain-language version of what is wrong. */
function withMatch(order: OrderRow): OrderRow & {
  match: OrderMatch;
  concerns: string[];
} {
  const { lines, receipts, invoices } = documentsOf(order);
  const match = matchOrder(lines, receipts, invoices);
  return { ...order, match, concerns: concerns(match) };
}

export const procurementService = {
  // -------------------------------------------------------------------------
  // Suppliers
  // -------------------------------------------------------------------------

  async listSuppliers(status?: SupplierStatus[]) {
    await requirePermission("procurement.supplier.view");
    const suppliers = await procurementRepository.listSuppliers(status);

    const now = Date.now();
    return suppliers.map((supplier) => ({
      ...supplier,
      // Flagged on the row rather than only on the detail screen, because the
      // moment somebody needs to know a tax clearance has lapsed is the moment
      // they are picking a supplier off this list.
      taxClearanceLapsed: Boolean(
        supplier.taxClearanceExpiresAt &&
          supplier.taxClearanceExpiresAt.getTime() < now,
      ),
    }));
  },

  async getSupplier(id: string) {
    await requirePermission("procurement.supplier.view");
    const supplier = await procurementRepository.findSupplier(id);
    if (!supplier) throw new NotFoundError("Supplier");
    return supplier;
  },

  /**
   * Adding one.
   *
   * Created PENDING whoever adds it. Somebody with the vetting permission has
   * to clear them before an order can be raised, which is the point of having
   * a register at all rather than a name typed onto an order.
   */
  async createSupplier(input: unknown) {
    await requirePermission("procurement.supplier.manage");
    const data = supplierSchema.parse(input);

    return procurementRepository.createSupplier({
      reference: await nextReference("SUP"),
      name: data.name,
      tradingName: data.tradingName,
      registrationNumber: data.registrationNumber,
      vatNumber: data.vatNumber,
      contactName: data.contactName,
      email: data.email || undefined,
      phone: data.phone,
      address: data.address,
      bbbeeLevel: data.bbbeeLevel,
      taxClearanceExpiresAt: data.taxClearanceExpiresAt,
      supplies: data.supplies,
      notes: data.notes,
      status: "PENDING",
    });
  },

  async updateSupplier(input: unknown) {
    await requirePermission("procurement.supplier.manage");
    const { id, ...data } = updateSupplierSchema.parse(input);

    const supplier = await procurementRepository.findSupplier(id);
    if (!supplier) throw new NotFoundError("Supplier");

    return procurementRepository.updateSupplier(id, {
      ...data,
      email: data.email || null,
    });
  },

  /** Clearing a supplier to buy from, or stopping it. */
  async decideSupplier(input: unknown) {
    await requirePermission("procurement.supplier.approve");
    const { id, status, reason } = supplierDecisionSchema.parse(input);

    const supplier = await procurementRepository.findSupplier(id);
    if (!supplier) throw new NotFoundError("Supplier");

    return procurementRepository.updateSupplier(id, {
      status,
      notes: reason
        ? `${supplier.notes ? `${supplier.notes}\n\n` : ""}${status}: ${reason}`
        : supplier.notes,
    });
  },

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  async listOrders(status?: PurchaseOrderStatus[]) {
    await requirePermission("procurement.order.view");
    const orders = await procurementRepository.listOrders(status);
    return orders.map(withMatch);
  },

  async getOrder(id: string) {
    await requirePermission("procurement.order.view");
    const order = await procurementRepository.findOrder(id);
    if (!order) throw new NotFoundError("Purchase order");

    return {
      ...withMatch(order),
      approvalTrail: await approvalTrailFor("PURCHASE_ORDER", order.id),
      pendingApproval: await pendingApprovalFor("PURCHASE_ORDER", order.id),
    };
  },

  /**
   * Raising one.
   *
   * A draft is the requisition — what a site wants, before anybody has
   * committed the company to paying for it. Nothing is spent here.
   */
  async createOrder(input: unknown) {
    await requirePermission("procurement.order.create");
    const data = createOrderSchema.parse(input);

    const supplier = await procurementRepository.findSupplier(data.supplierId);
    if (!supplier) throw new NotFoundError("Supplier");
    if (supplier.status !== "APPROVED") {
      throw new BusinessRuleError(
        supplier.status === "SUSPENDED"
          ? `${supplier.name} is suspended. Nothing can be ordered from them.`
          : `${supplier.name} has not been cleared to buy from yet.`,
      );
    }

    const order = await procurementRepository.createOrder({
      reference: await nextReference("PO"),
      supplierId: data.supplierId,
      projectId: data.projectId,
      deliverTo: data.deliverTo,
      requiredBy: data.requiredBy,
      notes: data.notes,
      status: "DRAFT",
    });

    for (const [index, line] of data.lines.entries()) {
      await procurementRepository.createLine({
        purchaseOrderId: order.id,
        lineNumber: index + 1,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        unitPriceCents: toCents(line.unitPriceRands),
        category: line.category,
      });
    }

    return procurementRepository.findOrder(order.id);
  },

  async updateOrder(input: unknown) {
    await requirePermission("procurement.order.create");
    const { id, ...data } = updateOrderSchema.parse(input);

    const order = await this.mustBeDraft(id);

    return procurementRepository.updateOrder(order.id, {
      supplierId: data.supplierId,
      projectId: data.projectId ?? null,
      deliverTo: data.deliverTo,
      requiredBy: data.requiredBy,
      notes: data.notes,
    });
  },

  async addLine(input: unknown) {
    await requirePermission("procurement.order.create");
    const data = addOrderLineSchema.parse(input);

    await this.mustBeDraft(data.purchaseOrderId);

    return procurementRepository.createLine({
      purchaseOrderId: data.purchaseOrderId,
      lineNumber: await procurementRepository.nextLineNumber(data.purchaseOrderId),
      description: data.description,
      unit: data.unit,
      quantity: data.quantity,
      unitPriceCents: toCents(data.unitPriceRands),
      category: data.category,
    });
  },

  async removeLine(input: unknown) {
    await requirePermission("procurement.order.create");
    const data = removeOrderLineSchema.parse(input);

    await this.mustBeDraft(data.purchaseOrderId);

    const line = await procurementRepository.findLine(data.lineId);
    if (!line || line.purchaseOrderId !== data.purchaseOrderId) {
      throw new NotFoundError("Line");
    }
    // Belt and braces behind the draft check: a line somebody has already
    // signed for is history, and removing it would leave a delivery against
    // something the order no longer says was ever bought.
    if (line.receiptLines.length > 0) {
      throw new BusinessRuleError(
        "Something has already been delivered against this line. It cannot be removed.",
      );
    }

    return procurementRepository.deleteLine(data.lineId);
  },

  /**
   * Sending it for approval.
   *
   * With no chain configured the order is approved outright, which is the
   * right answer for a company of fifteen: a ladder should not appear until
   * somebody asks for one. The value goes to the engine as the record, so a
   * chain can say "over R50 000 goes to the director" without this service
   * knowing what the threshold is.
   */
  async submitOrder(input: unknown) {
    const actorId = await requirePermission("procurement.order.submit");
    const { id } = submitOrderSchema.parse(input);

    const order = await this.mustBeDraft(id);
    if (order.lines.length === 0) {
      throw new BusinessRuleError("There is nothing on this order to approve.");
    }

    const valueCents = order.lines.reduce(
      (total, line) =>
        total + lineValueCents(toNumber(line.quantity), Number(line.unitPriceCents)),
      0,
    );

    const instance = await startWorkflow({
      entityType: "PURCHASE_ORDER",
      entityId: order.id,
      triggerEvent: "purchase_order.submitted",
      record: {
        estimatedValueCents: BigInt(valueCents),
        status: order.status,
      },
    });

    return procurementRepository.updateOrder(order.id, {
      status: instance ? "SUBMITTED" : "APPROVED",
      submittedById: actorId,
      // No chain means it is committed the moment it is submitted, so the
      // approval stamp has to be written here too — otherwise the order reads
      // as approved by nobody, and the audit trail has a hole in it.
      approvedById: instance ? null : actorId,
      approvedAt: instance ? null : new Date(),
    });
  },

  /**
   * Deciding one.
   *
   * Separation of duties: holding `procurement.order.approve` is not enough if
   * you raised the order or submitted it. This is the same rule the tender
   * approvals use, and it matters more here — an order is money.
   */
  async decideOrder(input: unknown) {
    const actorId = await requirePermission("procurement.order.approve");
    const { approvalId, decision, comment } = orderDecisionSchema.parse(input);

    const approval = await db.workflowApproval.findUnique({
      where: { id: approvalId },
      include: { instance: true },
    });
    if (!approval) throw new NotFoundError("Approval");

    const order = await procurementRepository.findOrder(approval.instance.entityId);
    if (!order) throw new NotFoundError("Purchase order");

    const result = await decide({
      approvalId,
      decision,
      comment,
      canDecide: async () => {
        if (order.createdBy && order.createdBy === actorId) {
          throw new ForbiddenError(
            "You cannot approve an order you raised. Ask another approver.",
          );
        }
        if (order.submittedById === actorId) {
          throw new ForbiddenError(
            "You cannot approve an order you submitted for approval.",
          );
        }
      },
    });

    // Only the last rung settles it. A two-rung chain where the first approver
    // finishes it is a queue of people who can each end it, not a hierarchy.
    if (result.instanceStatus === "APPROVED") {
      await procurementRepository.updateOrder(order.id, {
        status: "APPROVED",
        approvedById: actorId,
        approvedAt: new Date(),
      });
    } else if (result.instanceStatus === "REJECTED") {
      await procurementRepository.updateOrder(order.id, {
        status: "REJECTED",
        rejectedReason: comment ?? null,
      });
    }

    return result;
  },

  async cancelOrder(input: unknown) {
    await requirePermission("procurement.order.cancel");
    const { id, reason } = cancelOrderSchema.parse(input);

    const order = await procurementRepository.findOrder(id);
    if (!order) throw new NotFoundError("Purchase order");
    if (order.status === "CLOSED" || order.status === "CANCELLED") {
      throw new BusinessRuleError("That order is already finished with.");
    }
    if (order.receipts.length > 0) {
      throw new BusinessRuleError(
        "Something has already been delivered against this order. Close it instead, " +
          "so what arrived stays on the record.",
      );
    }

    return procurementRepository.updateOrder(id, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      rejectedReason: reason,
    });
  },

  /**
   * Closing one.
   *
   * Allowed while it is still short or still over-billed, because sometimes
   * that is the right call — the supplier has written the balance off, or
   * nobody is going to chase forty rand. What is not allowed is closing it
   * silently: the reason goes on the record, and an order that does not match
   * says so on the way out.
   */
  async closeOrder(input: unknown) {
    await requirePermission("procurement.order.approve");
    const { id, reason } = closeOrderSchema.parse(input);

    const order = await procurementRepository.findOrder(id);
    if (!order) throw new NotFoundError("Purchase order");
    if (order.status !== "APPROVED") {
      throw new BusinessRuleError(
        "Only an approved order can be closed. A draft is cancelled instead.",
      );
    }

    const matched = withMatch(order);
    if (!matched.match.settled && !reason) {
      throw new BusinessRuleError(
        `This order does not balance — ${matched.concerns[0]}. Say why it is being closed anyway.`,
      );
    }

    return procurementRepository.updateOrder(id, {
      status: "CLOSED",
      closedAt: new Date(),
      notes: reason
        ? `${order.notes ? `${order.notes}\n\n` : ""}Closed: ${reason}`
        : order.notes,
    });
  },

  // -------------------------------------------------------------------------
  // Deliveries
  // -------------------------------------------------------------------------

  /**
   * Signing for a delivery.
   *
   * Only against an approved order, and only against lines that are on it.
   * Receiving something nobody ordered is a conversation with the supplier
   * rather than a row in the register — recording it here would put goods into
   * the match that no order ever authorised.
   */
  async recordReceipt(input: unknown) {
    await requirePermission("procurement.receipt.record");
    const data = recordReceiptSchema.parse(input);

    const order = await procurementRepository.findOrder(data.purchaseOrderId);
    if (!order) throw new NotFoundError("Purchase order");
    if (order.status !== "APPROVED") {
      throw new BusinessRuleError(
        order.status === "DRAFT" || order.status === "SUBMITTED"
          ? "That order has not been approved yet. Nothing should have been delivered against it."
          : "That order is closed.",
      );
    }

    const onThisOrder = new Set(order.lines.map((line) => line.id));
    for (const line of data.lines) {
      if (!onThisOrder.has(line.purchaseOrderLineId)) {
        throw new BusinessRuleError(
          "Something was delivered that is not on this order. Raise it with the supplier.",
        );
      }
    }

    const receipt = await procurementRepository.createReceipt({
      reference: await nextReference("GRN"),
      purchaseOrderId: order.id,
      receivedAt: data.receivedAt,
      deliveryNoteNumber: data.deliveryNoteNumber,
      receivedByEmployeeId: data.receivedByEmployeeId,
      note: data.note,
    });

    for (const line of data.lines) {
      if (line.quantity === 0 && line.rejectedQuantity === 0) continue;
      await procurementRepository.createReceiptLine({
        goodsReceiptId: receipt.id,
        purchaseOrderLineId: line.purchaseOrderLineId,
        quantity: line.quantity,
        rejectedQuantity: line.rejectedQuantity,
        rejectedReason: line.rejectedReason,
      });
    }

    return procurementRepository.findOrder(order.id);
  },

  // -------------------------------------------------------------------------
  // Invoices
  // -------------------------------------------------------------------------

  async listInvoices() {
    await requirePermission("procurement.invoice.view");
    return procurementRepository.listInvoices();
  },

  async recordInvoice(input: unknown) {
    await requirePermission("procurement.invoice.record");
    const data = recordInvoiceSchema.parse(input);

    const order = await procurementRepository.findOrder(data.purchaseOrderId);
    if (!order) throw new NotFoundError("Purchase order");
    if (order.status === "DRAFT" || order.status === "SUBMITTED") {
      throw new BusinessRuleError(
        "That order has not been approved. An invoice against it is not ours to pay.",
      );
    }

    return procurementRepository.createInvoice({
      supplierId: order.supplierId,
      purchaseOrderId: order.id,
      invoiceNumber: data.invoiceNumber,
      invoicedAt: data.invoicedAt,
      dueAt: data.dueAt,
      netAmountCents: toCents(data.netAmountRands),
      vatCents: toCents(data.vatRands),
      status: "RECEIVED",
    });
  },

  /**
   * Releasing an invoice, disputing it, or marking it paid.
   *
   * Approving one that takes the order past what has been delivered needs it
   * said out loud. The match is not a veto — a supplier may legitimately
   * invoice ahead on a long lead item — but it must not be possible to release
   * an over-billing without anybody noticing, which is the whole reason the
   * three documents are compared at all.
   */
  async decideInvoice(input: unknown) {
    await requirePermission("procurement.invoice.approve");
    const { id, decision, reason } = invoiceDecisionSchema.parse(input);

    const invoice = await procurementRepository.findInvoice(id);
    if (!invoice) throw new NotFoundError("Invoice");

    if (decision === "APPROVED") {
      const order = await procurementRepository.findOrder(invoice.purchaseOrderId);
      if (!order) throw new NotFoundError("Purchase order");

      const matched = withMatch(order);
      if (matched.match.billing === "OVER" && !reason) {
        throw new BusinessRuleError(
          `${matched.concerns[0]}. Say why this invoice is being released anyway.`,
        );
      }
    }

    return procurementRepository.updateInvoice(id, {
      status: decision,
      disputedReason: decision === "DISPUTED" ? reason : invoice.disputedReason,
      paidAt: decision === "PAID" ? new Date() : invoice.paidAt,
      // The override reason belongs on the invoice, not in a log nobody reads.
      ...(decision === "APPROVED" && reason ? { disputedReason: reason } : {}),
    });
  },

  // -------------------------------------------------------------------------
  // What a project has committed
  // -------------------------------------------------------------------------

  /**
   * Approved purchase orders against a project, as money.
   *
   * The project budget already counts approved expenses as committed. An
   * approved order is the same kind of thing and was simply invisible until
   * now: the difference between a budget that says what has been spent and one
   * that says what has been promised is a month, and a month is how long it
   * takes to overspend one.
   */
  async committedFor(projectId: string) {
    await requirePermission("procurement.order.view");
    const orders = await procurementRepository.approvedOrdersFor(projectId);

    const committedCents = orders.reduce(
      (total, order) =>
        total +
        order.lines.reduce(
          (lineTotal, line) =>
            lineTotal +
            lineValueCents(toNumber(line.quantity), Number(line.unitPriceCents)),
          0,
        ),
      0,
    );

    return { orderCount: orders.length, committedCents };
  },

  /**
   * The module's front page: what needs somebody today.
   *
   * Over-billing first, for the same reason `concerns` orders itself that way.
   */
  async overview() {
    await requirePermission("procurement.order.view");
    const orders = (await procurementRepository.listOrders()).map(withMatch);

    const live = orders.filter((order) => order.status === "APPROVED");

    return {
      awaitingApproval: orders.filter((order) => order.status === "SUBMITTED").length,
      draft: orders.filter((order) => order.status === "DRAFT").length,
      live: live.length,
      overBilledCents: live.reduce(
        (total, order) => total + order.match.overBilledCents,
        0,
      ),
      overBilled: live.filter((order) => order.match.billing === "OVER"),
      partDelivered: live.filter((order) => order.match.delivery === "PART"),
      overDelivered: live.filter((order) => order.match.delivery === "OVER"),
      settled: live.filter((order) => order.match.settled),
      canApprove: await hasPermission("procurement.order.approve"),
      canReceive: await hasPermission("procurement.receipt.record"),
    };
  },

  // -------------------------------------------------------------------------

  /** An order that can still be edited, or the reason it cannot be. */
  async mustBeDraft(id: string) {
    const order = await procurementRepository.findOrder(id);
    if (!order) throw new NotFoundError("Purchase order");
    if (order.status !== "DRAFT") {
      throw new BusinessRuleError(
        order.status === "SUBMITTED"
          ? "That order is with an approver. It cannot be changed while they are looking at it."
          : "That order has been approved. Changing what was bought after the fact is what a new order is for.",
      );
    }
    return order;
  },
};
