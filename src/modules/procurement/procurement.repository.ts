import { db, rawDb } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import type {
  Prisma,
  PurchaseOrderStatus,
  SupplierStatus,
} from "@/generated/prisma/client";

/** Data access for procurement. No rules, no permission checks (ADR-008). */

function tenant() {
  return requireRequestContext().organisationId;
}

/**
 * Everything needed to price and match an order in one read.
 *
 * The match needs all three documents at once — lines, deliveries against
 * those lines, and the invoices — so loading them separately would be three
 * round trips to answer one question, and a window in which the second read
 * sees a delivery the first one did not.
 */
const WHOLE_ORDER = {
  supplier: { select: { id: true, name: true, status: true } },
  project: { select: { id: true, name: true, reference: true } },
  submittedBy: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  lines: { orderBy: { lineNumber: "asc" } },
  receipts: {
    orderBy: { receivedAt: "asc" },
    include: {
      lines: true,
      receivedByEmployee: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  },
  invoices: { orderBy: { invoicedAt: "asc" } },
} satisfies Prisma.PurchaseOrderInclude;

export const procurementRepository = {
  // -------------------------------------------------------------------------
  // Suppliers
  // -------------------------------------------------------------------------

  listSuppliers(status?: SupplierStatus[]) {
    return db.supplier.findMany({
      where: status?.length ? { status: { in: status } } : undefined,
      orderBy: { name: "asc" },
      include: { _count: { select: { purchaseOrders: true } } },
    });
  },

  findSupplier(id: string) {
    return db.supplier.findUnique({
      where: { id },
      include: {
        purchaseOrders: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { lines: true },
        },
      },
    });
  },

  createSupplier(data: Omit<Prisma.SupplierUncheckedCreateInput, "organisationId">) {
    return db.supplier.create({ data: { ...data, organisationId: tenant() } });
  },

  updateSupplier(id: string, data: Prisma.SupplierUncheckedUpdateInput) {
    return db.supplier.update({ where: { id }, data });
  },

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  listOrders(status?: PurchaseOrderStatus[]) {
    return db.purchaseOrder.findMany({
      where: status?.length ? { status: { in: status } } : undefined,
      orderBy: { createdAt: "desc" },
      include: WHOLE_ORDER,
    });
  },

  findOrder(id: string) {
    return db.purchaseOrder.findUnique({ where: { id }, include: WHOLE_ORDER });
  },

  createOrder(
    data: Omit<Prisma.PurchaseOrderUncheckedCreateInput, "organisationId">,
  ) {
    return db.purchaseOrder.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  updateOrder(id: string, data: Prisma.PurchaseOrderUncheckedUpdateInput) {
    return db.purchaseOrder.update({ where: { id }, data });
  },

  /**
   * The next line number on an order.
   *
   * Taken from the highest already used rather than from the count, because
   * lines get removed and reusing a deleted line's number would make a
   * supplier's query about "line 3" refer to two different things.
   *
   * Read through `rawDb` on purpose, and it is the only read in this file that
   * is. Removal is soft, so the extended client cannot see the deleted line —
   * but `@@unique([purchaseOrderId, lineNumber])` still can, and the row is
   * still in the table. Asking the filtered client for the highest number
   * hands back one that is already taken, and the insert fails. Scoped by
   * organisation explicitly, since the unextended client applies no tenancy.
   */
  async nextLineNumber(purchaseOrderId: string) {
    const highest = await rawDb.purchaseOrderLine.findFirst({
      where: { purchaseOrderId, organisationId: tenant() },
      orderBy: { lineNumber: "desc" },
      select: { lineNumber: true },
    });
    return (highest?.lineNumber ?? 0) + 1;
  },

  createLine(
    data: Omit<Prisma.PurchaseOrderLineUncheckedCreateInput, "organisationId">,
  ) {
    return db.purchaseOrderLine.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  findLine(id: string) {
    return db.purchaseOrderLine.findUnique({
      where: { id },
      include: { receiptLines: { select: { id: true } } },
    });
  },

  deleteLine(id: string) {
    // Soft, through the extension. The order it was on keeps its history.
    return db.purchaseOrderLine.delete({ where: { id } });
  },

  // -------------------------------------------------------------------------
  // Deliveries
  // -------------------------------------------------------------------------

  createReceipt(
    data: Omit<Prisma.GoodsReceiptUncheckedCreateInput, "organisationId">,
  ) {
    return db.goodsReceipt.create({ data: { ...data, organisationId: tenant() } });
  },

  createReceiptLine(
    data: Omit<Prisma.GoodsReceiptLineUncheckedCreateInput, "organisationId">,
  ) {
    return db.goodsReceiptLine.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  // -------------------------------------------------------------------------
  // Invoices
  // -------------------------------------------------------------------------

  listInvoices(status?: Prisma.SupplierInvoiceWhereInput["status"]) {
    return db.supplierInvoice.findMany({
      where: status ? { status } : undefined,
      orderBy: { invoicedAt: "desc" },
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: {
          select: { id: true, reference: true, projectId: true },
        },
      },
    });
  },

  findInvoice(id: string) {
    return db.supplierInvoice.findUnique({ where: { id } });
  },

  createInvoice(
    data: Omit<Prisma.SupplierInvoiceUncheckedCreateInput, "organisationId">,
  ) {
    return db.supplierInvoice.create({
      data: { ...data, organisationId: tenant() },
    });
  },

  updateInvoice(id: string, data: Prisma.SupplierInvoiceUncheckedUpdateInput) {
    return db.supplierInvoice.update({ where: { id }, data });
  },

  // -------------------------------------------------------------------------
  // Money already committed
  // -------------------------------------------------------------------------

  /**
   * Approved orders on a project, with their lines.
   *
   * Lines rather than a stored total, because there is no stored total — see
   * the schema. The sum is done in the service where the rounding rule lives.
   */
  approvedOrdersFor(projectId: string) {
    return db.purchaseOrder.findMany({
      where: { projectId, status: { in: ["APPROVED", "CLOSED"] } },
      select: {
        id: true,
        reference: true,
        lines: { select: { quantity: true, unitPriceCents: true } },
      },
    });
  },
};
