import { db } from "@/lib/database/client";
import { nextReference } from "@/lib/database/reference-numbers";
import type { ExpenseCategory, SupplierStatus } from "@/generated/prisma/client";

/**
 * The procurement demonstration dataset.
 *
 * Written to exercise the three-way match rather than to fill a table. The
 * whole claim of the module is that it notices when the order, the delivery
 * and the invoice disagree, and eight tidy orders that all balance prove none
 * of it. So every state the match can be in has one order in it:
 *
 *   - a draft nobody has sent anywhere, which is what a requisition is here;
 *   - one sitting with an approver;
 *   - one approved with nothing delivered yet;
 *   - a part delivery, which on a construction site is the ordinary case —
 *     half the reinforcing on Tuesday, the rest the following week;
 *   - an over-delivery, where the supplier sent eleven tonnes for an order of
 *     ten and will invoice for all eleven;
 *   - a load partly sent back, so the accepted and rejected quantities differ;
 *   - the one that matters: fully invoiced against a half delivery, which
 *     matched against the *order* would have looked correct;
 *   - one that balances end to end and can be closed.
 *
 * The suppliers are equally deliberate. One is suspended, one has a tax
 * clearance that lapsed last month, and one has no B-BBEE certificate at all —
 * because the register's job is to make those three things visible before
 * somebody raises an order, not after.
 *
 * Idempotent, like the HR and safety datasets and for the same reason: the
 * seed builds a database from nothing and the backfill runs against one that
 * has been live for weeks. Suppliers are matched on name and orders on their
 * note, both of which are distinctive enough to be natural keys.
 */

export interface SupplierSpec {
  name: string;
  tradingName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  status: SupplierStatus;
  bbbeeLevel?: number;
  /** Days from today. Negative has already lapsed. */
  taxClearanceInDays?: number;
  supplies: string[];
  notes?: string;
}

export const SUPPLIERS: SupplierSpec[] = [
  {
    name: "Afrimat Readymix (Pty) Ltd",
    registrationNumber: "2006/022534/07",
    vatNumber: "4130225341",
    contactName: "Dawie Kruger",
    email: "orders@afrimat-readymix.co.za",
    phone: "013 656 2200",
    status: "APPROVED",
    bbbeeLevel: 2,
    taxClearanceInDays: 214,
    supplies: ["readymix", "aggregate", "pump hire"],
  },
  {
    name: "Highveld Steel & Mesh CC",
    tradingName: "Highveld Rebar",
    registrationNumber: "2011/118820/23",
    vatNumber: "4380118821",
    contactName: "Nkosinathi Mahlangu",
    email: "sales@highveldrebar.co.za",
    phone: "013 692 4471",
    status: "APPROVED",
    bbbeeLevel: 1,
    taxClearanceInDays: 96,
    supplies: ["reinforcing", "mesh", "binding wire"],
  },
  {
    name: "Emalahleni Plant Hire",
    registrationNumber: "2015/447120/07",
    contactName: "Riaan Oosthuizen",
    phone: "013 656 8890",
    status: "APPROVED",
    bbbeeLevel: 4,
    // Lapsed last month. On a public-sector contract this becomes the
    // client's problem and therefore ours, which is the point of the flag.
    taxClearanceInDays: -34,
    supplies: ["TLB hire", "compactor hire", "water cart"],
  },
  {
    name: "Sizwe Safety Supplies",
    contactName: "Portia Sithole",
    email: "portia@sizwesafety.co.za",
    status: "APPROVED",
    bbbeeLevel: 1,
    taxClearanceInDays: 301,
    supplies: ["PPE", "signage", "barricading"],
  },
  {
    name: "Kanyisa Aggregates",
    contactName: "Bongani Zulu",
    phone: "082 447 1180",
    // No certificate at all, which is not the same as level 8 and is shown
    // differently on the register for exactly that reason.
    status: "PENDING",
    supplies: ["crusher run", "G5 fill"],
    notes: "Quoted well on the water works. Nothing ordered until they are cleared.",
  },
  {
    name: "Mpumalanga Bulk Traders",
    contactName: "Jaco Steyn",
    status: "SUSPENDED",
    bbbeeLevel: 6,
    taxClearanceInDays: 58,
    supplies: ["cement", "sand"],
    notes:
      "SUSPENDED: Two short deliveries in March invoiced in full, and no credit note after six weeks.",
  },
];

export interface LineSpec {
  description: string;
  unit: string;
  quantity: number;
  unitPriceRands: number;
  category: ExpenseCategory;
}

export interface DeliverySpec {
  /** Days ago it arrived. */
  daysAgo: number;
  deliveryNoteNumber?: string;
  /** An employee by "First Last". */
  receivedBy?: string;
  note?: string;
  /** Keyed by the line's description, so a reordered list cannot break it. */
  quantities: Record<string, number>;
  rejected?: Record<string, { quantity: number; reason: string }>;
}

export interface InvoiceSpec {
  invoiceNumber: string;
  daysAgo: number;
  dueInDays?: number;
  netAmountRands: number;
  vatRands?: number;
  status?: "RECEIVED" | "APPROVED" | "DISPUTED" | "PAID";
  disputedReason?: string;
}

export interface OrderSpec {
  supplier: string;
  /** Matched against the seeded projects by name fragment. Null for the yard. */
  site: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "CLOSED";
  /** Days ago it was raised. */
  raisedDaysAgo: number;
  requiredInDays?: number;
  deliverTo?: string;
  /** The natural key. Distinctive, and stable across runs. */
  note: string;
  /** Who raised it, by role key. */
  raisedBy?: string;
  /** Who authorised it, by role key. Absent on drafts and submitted orders. */
  approvedBy?: string;
  lines: LineSpec[];
  deliveries?: DeliverySpec[];
  invoices?: InvoiceSpec[];
}

export const ORDERS: OrderSpec[] = [
  {
    supplier: "Afrimat Readymix (Pty) Ltd",
    site: "Water treatment",
    status: "DRAFT",
    raisedDaysAgo: 1,
    requiredInDays: 9,
    deliverTo: "Gate 2, off the R544 service road",
    note: "Second pour, reservoir base slab. Priced off the March quotation.",
    raisedBy: "buyer",
    lines: [
      {
        description: "Ready-mix 30MPa",
        unit: "m³",
        quantity: 46,
        unitPriceRands: 1685,
        category: "MATERIALS",
      },
      {
        description: "Concrete pump on site",
        unit: "day",
        quantity: 2,
        unitPriceRands: 8400,
        category: "PLANT",
      },
    ],
  },
  {
    supplier: "Emalahleni Plant Hire",
    site: "Reservoir",
    status: "SUBMITTED",
    raisedDaysAgo: 3,
    requiredInDays: 4,
    note: "TLB for the pipe trench while ours is in for a gearbox.",
    raisedBy: "project_manager",
    lines: [
      {
        description: "TLB with operator",
        unit: "day",
        quantity: 12,
        unitPriceRands: 4650,
        category: "PLANT",
      },
    ],
  },
  {
    supplier: "Sizwe Safety Supplies",
    site: null,
    status: "APPROVED",
    raisedDaysAgo: 6,
    requiredInDays: 3,
    deliverTo: "Yard stores, Witbank",
    note: "Yard restock — the annual PPE issue is due at the end of the month.",
    raisedBy: "buyer",
    approvedBy: "finance_manager",
    lines: [
      {
        description: "Hard hats, white",
        unit: "each",
        quantity: 40,
        unitPriceRands: 118,
        category: "OTHER",
      },
      {
        description: "Hi-vis vests, class 2",
        unit: "each",
        quantity: 40,
        unitPriceRands: 96,
        category: "OTHER",
      },
    ],
  },
  {
    supplier: "Highveld Steel & Mesh CC",
    site: "Water treatment",
    status: "APPROVED",
    raisedDaysAgo: 21,
    requiredInDays: -7,
    note: "Reinforcing for the reservoir walls, called off against the schedule.",
    raisedBy: "buyer",
    approvedBy: "finance_manager",
    lines: [
      {
        description: "Y12 reinforcing bar",
        unit: "tonne",
        quantity: 10,
        unitPriceRands: 18_500,
        category: "MATERIALS",
      },
      {
        description: "Ref 193 mesh sheets",
        unit: "each",
        quantity: 60,
        unitPriceRands: 742,
        category: "MATERIALS",
      },
    ],
    // Half the reinforcing on one load and the mesh in full. The ordinary
    // case on site, and the one a "delivered yes/no" flag cannot express.
    deliveries: [
      {
        daysAgo: 12,
        deliveryNoteNumber: "HR-44210",
        receivedBy: "Pieter van Wyk",
        quantities: { "Y12 reinforcing bar": 5.5, "Ref 193 mesh sheets": 60 },
      },
    ],
  },
  {
    supplier: "Afrimat Readymix (Pty) Ltd",
    site: "Reservoir",
    status: "APPROVED",
    raisedDaysAgo: 16,
    requiredInDays: -9,
    note: "Blinding layer under the pump house slab.",
    raisedBy: "project_manager",
    approvedBy: "executive",
    lines: [
      {
        description: "Ready-mix 15MPa",
        unit: "m³",
        quantity: 18,
        unitPriceRands: 1385,
        category: "MATERIALS",
      },
    ],
    // Nineteen and a half cubes for an order of eighteen. Somebody signed for
    // it, and the supplier will invoice for all of it.
    deliveries: [
      {
        daysAgo: 9,
        deliveryNoteNumber: "AF-90188",
        receivedBy: "Sipho Nkosi",
        note: "Two trucks. The second was over-loaded and they poured the lot.",
        quantities: { "Ready-mix 15MPa": 19.5 },
      },
    ],
  },
  {
    supplier: "Highveld Steel & Mesh CC",
    site: "Reservoir",
    status: "APPROVED",
    raisedDaysAgo: 11,
    requiredInDays: -2,
    note: "Binding wire and offcut bar for the starter bars.",
    raisedBy: "buyer",
    approvedBy: "finance_manager",
    lines: [
      {
        description: "Binding wire, 2mm",
        unit: "roll",
        quantity: 24,
        unitPriceRands: 385,
        category: "MATERIALS",
      },
    ],
    deliveries: [
      {
        daysAgo: 5,
        deliveryNoteNumber: "HR-44388",
        receivedBy: "Pieter van Wyk",
        quantities: { "Binding wire, 2mm": 20 },
        rejected: {
          "Binding wire, 2mm": {
            quantity: 4,
            reason: "Four rolls had been rained on and were rusted through.",
          },
        },
      },
    ],
  },
  {
    supplier: "Emalahleni Plant Hire",
    site: "Water treatment",
    status: "APPROVED",
    raisedDaysAgo: 30,
    requiredInDays: -16,
    note: "Compactor for the pipe bedding, two weeks on the trench.",
    raisedBy: "project_manager",
    approvedBy: "finance_manager",
    lines: [
      {
        description: "Ride-on compactor",
        unit: "day",
        quantity: 14,
        unitPriceRands: 2850,
        category: "PLANT",
      },
    ],
    // Seven days on site, fourteen on the invoice. This is the one the module
    // exists for: matched against the order it reads as correct.
    deliveries: [
      {
        daysAgo: 22,
        deliveryNoteNumber: "EPH-2214",
        receivedBy: "Sipho Nkosi",
        note: "Off-hired early — the trench was stopped by the wet weather.",
        quantities: { "Ride-on compactor": 7 },
      },
    ],
    invoices: [
      {
        invoiceNumber: "EPH-INV-3390",
        daysAgo: 15,
        dueInDays: 15,
        netAmountRands: 39_900,
        vatRands: 5_985,
        status: "RECEIVED",
      },
    ],
  },
  {
    supplier: "Sizwe Safety Supplies",
    site: "Water treatment",
    status: "APPROVED",
    raisedDaysAgo: 40,
    requiredInDays: -30,
    note: "Barricading and signage for the trench along the access road.",
    raisedBy: "buyer",
    approvedBy: "finance_manager",
    lines: [
      {
        description: "Plastic barricade, 2m",
        unit: "each",
        quantity: 30,
        unitPriceRands: 340,
        category: "OTHER",
      },
      {
        description: "Excavation warning signs",
        unit: "each",
        quantity: 12,
        unitPriceRands: 275,
        category: "OTHER",
      },
    ],
    // Balances end to end. The screen needs one of these to show what
    // "settled" looks like, or every order on it is a problem.
    deliveries: [
      {
        daysAgo: 34,
        deliveryNoteNumber: "SZ-11902",
        receivedBy: "Pieter van Wyk",
        quantities: {
          "Plastic barricade, 2m": 30,
          "Excavation warning signs": 12,
        },
      },
    ],
    invoices: [
      {
        invoiceNumber: "SZ-INV-8871",
        daysAgo: 30,
        dueInDays: 0,
        netAmountRands: 13_500,
        vatRands: 2_025,
        status: "APPROVED",
      },
    ],
  },
];

export interface ProcurementDemoSummary {
  suppliers: number;
  orders: number;
  orderLines: number;
  deliveries: number;
  invoices: number;
}

/** Midnight UTC, `offset` days from today. */
function days(offset: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

/** The same, at a plausible hour of the working day. */
function daysAtHour(offset: number, hour: number): Date {
  const date = days(offset);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

function toCents(rands: number): bigint {
  return BigInt(Math.round(rands * 100));
}

export async function seedProcurementDemo(params: {
  organisationId: string;
  userIds: Record<string, string>;
}): Promise<ProcurementDemoSummary> {
  const { organisationId, userIds } = params;
  const summary: ProcurementDemoSummary = {
    suppliers: 0,
    orders: 0,
    orderLines: 0,
    deliveries: 0,
    invoices: 0,
  };

  /**
   * A login by role key, falling back to whoever runs the company.
   *
   * On a fresh seed every role has somebody. On a live database backfilled
   * module by module some do not, and an order approved by nobody is a worse
   * demonstration than one approved by the managing director.
   */
  const whoever = (roleKey: string | undefined) =>
    roleKey === undefined ? undefined : (userIds[roleKey] ?? userIds.executive);

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
  /** A project by name fragment, falling back to the first one there is. */
  const findSite = (fragment: string) =>
    (
      projects.find((project) =>
        project.name.toLowerCase().includes(fragment.toLowerCase()),
      ) ?? projects[0]
    )?.id;

  const supplierIdByName = new Map<string, string>();

  for (const spec of SUPPLIERS) {
    const already = await db.supplier.findFirst({
      where: { name: spec.name },
      select: { id: true },
    });
    if (already) {
      supplierIdByName.set(spec.name, already.id);
      continue;
    }

    const supplier = await db.supplier.create({
      data: {
        organisationId,
        reference: await nextReference("SUP"),
        name: spec.name,
        tradingName: spec.tradingName,
        registrationNumber: spec.registrationNumber,
        vatNumber: spec.vatNumber,
        contactName: spec.contactName,
        email: spec.email,
        phone: spec.phone,
        status: spec.status,
        bbbeeLevel: spec.bbbeeLevel,
        taxClearanceExpiresAt:
          spec.taxClearanceInDays === undefined
            ? undefined
            : days(spec.taxClearanceInDays),
        supplies: spec.supplies,
        notes: spec.notes,
      },
    });
    supplierIdByName.set(spec.name, supplier.id);
    summary.suppliers += 1;
  }

  for (const spec of ORDERS) {
    const already = await db.purchaseOrder.findFirst({
      where: { notes: spec.note },
      select: { id: true },
    });
    if (already) continue;

    const supplierId = supplierIdByName.get(spec.supplier);
    if (!supplierId) continue;

    const raisedAt = daysAtHour(-spec.raisedDaysAgo, 10);
    const order = await db.purchaseOrder.create({
      data: {
        organisationId,
        reference: await nextReference("PO"),
        supplierId,
        projectId: spec.site ? findSite(spec.site) : undefined,
        status: spec.status,
        deliverTo: spec.deliverTo,
        requiredBy:
          spec.requiredInDays === undefined ? undefined : days(spec.requiredInDays),
        notes: spec.note,
        submittedById: spec.status === "DRAFT" ? undefined : whoever(spec.raisedBy),
        approvedById: whoever(spec.approvedBy),
        approvedAt: spec.approvedBy ? daysAtHour(-spec.raisedDaysAgo + 1, 15) : undefined,
        closedAt: spec.status === "CLOSED" ? daysAtHour(-1, 16) : undefined,
        createdAt: raisedAt,
      },
    });
    summary.orders += 1;

    /** Line ids by description, so the deliveries can be keyed by name. */
    const lineIdByDescription = new Map<string, string>();

    for (const [index, line] of spec.lines.entries()) {
      const created = await db.purchaseOrderLine.create({
        data: {
          organisationId,
          purchaseOrderId: order.id,
          lineNumber: index + 1,
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
          unitPriceCents: toCents(line.unitPriceRands),
          category: line.category,
        },
      });
      lineIdByDescription.set(line.description, created.id);
      summary.orderLines += 1;
    }

    for (const delivery of spec.deliveries ?? []) {
      const receipt = await db.goodsReceipt.create({
        data: {
          organisationId,
          reference: await nextReference("GRN"),
          purchaseOrderId: order.id,
          receivedAt: daysAtHour(-delivery.daysAgo, 11),
          deliveryNoteNumber: delivery.deliveryNoteNumber,
          receivedByEmployeeId: delivery.receivedBy
            ? employeeIdByName.get(delivery.receivedBy)
            : undefined,
          note: delivery.note,
        },
      });
      summary.deliveries += 1;

      for (const [description, quantity] of Object.entries(delivery.quantities)) {
        const lineId = lineIdByDescription.get(description);
        if (!lineId) continue;
        const sentBack = delivery.rejected?.[description];

        await db.goodsReceiptLine.create({
          data: {
            organisationId,
            goodsReceiptId: receipt.id,
            purchaseOrderLineId: lineId,
            quantity,
            rejectedQuantity: sentBack?.quantity ?? 0,
            rejectedReason: sentBack?.reason,
          },
        });
      }
    }

    for (const invoice of spec.invoices ?? []) {
      await db.supplierInvoice.create({
        data: {
          organisationId,
          supplierId,
          purchaseOrderId: order.id,
          invoiceNumber: invoice.invoiceNumber,
          invoicedAt: daysAtHour(-invoice.daysAgo, 9),
          dueAt:
            invoice.dueInDays === undefined
              ? undefined
              : days(-invoice.daysAgo + invoice.dueInDays),
          netAmountCents: toCents(invoice.netAmountRands),
          vatCents: toCents(invoice.vatRands ?? 0),
          status: invoice.status ?? "RECEIVED",
          disputedReason: invoice.disputedReason,
        },
      });
      summary.invoices += 1;
    }
  }

  return summary;
}
