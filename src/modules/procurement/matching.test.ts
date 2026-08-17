import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOLERANCE,
  concerns,
  lineValueCents,
  matchLine,
  matchOrder,
  withinTolerance,
  type InvoicedAmount,
  type OrderedLine,
  type ReceivedAgainstLine,
} from "./matching";
import { describeQuantity } from "@/lib/format";

/**
 * The cases worth testing are the ones that cost money, not the ones where
 * everything went to plan. A part delivery, an over-delivery, an invoice for
 * goods still on the supplier's yard, and a rejected load — those are the four
 * that a buyer actually spends their week on.
 */

function line(overrides: Partial<OrderedLine> = {}): OrderedLine {
  return {
    id: "line-1",
    description: "Y12 reinforcing bar",
    unit: "tonne",
    quantity: 10,
    unitPriceCents: 1_850_00,
    ...overrides,
  };
}

function received(
  quantity: number,
  overrides: Partial<ReceivedAgainstLine> = {},
): ReceivedAgainstLine {
  return {
    purchaseOrderLineId: "line-1",
    quantity,
    rejectedQuantity: 0,
    ...overrides,
  };
}

function invoice(
  netAmountCents: number,
  overrides: Partial<InvoicedAmount> = {},
): InvoicedAmount {
  return {
    id: "inv-1",
    invoiceNumber: "INV-8891",
    netAmountCents,
    disputed: false,
    ...overrides,
  };
}

describe("a line on its own", () => {
  it("is awaiting delivery when nothing has arrived", () => {
    const match = matchLine(line(), []);

    expect(match.delivery).toBe("AWAITING");
    expect(match.receivedQuantity).toBe(0);
    expect(match.outstandingQuantity).toBe(10);
  });

  it("is part delivered when some has", () => {
    const match = matchLine(line(), [received(4)]);

    expect(match.delivery).toBe("PART");
    expect(match.outstandingQuantity).toBe(6);
  });

  it("adds several deliveries against the same line", () => {
    // The normal case on site: half on Tuesday, the rest the following week.
    const match = matchLine(line(), [received(4), received(6)]);

    expect(match.delivery).toBe("COMPLETE");
    expect(match.outstandingQuantity).toBe(0);
  });

  it("is over-delivered when more arrived than was ordered", () => {
    const match = matchLine(line(), [received(11)]);

    expect(match.delivery).toBe("OVER");
    // Not negative. An over-delivery leaves a conversation, not a shortfall.
    expect(match.outstandingQuantity).toBe(0);
  });

  it("does not count what was sent back as delivered", () => {
    const match = matchLine(line(), [
      received(8, { rejectedQuantity: 2, quantity: 8 }),
    ]);

    expect(match.delivery).toBe("PART");
    expect(match.rejectedQuantity).toBe(2);
    expect(match.outstandingQuantity).toBe(2);
  });

  it("ignores deliveries against a different line", () => {
    const match = matchLine(line(), [
      received(10, { purchaseOrderLineId: "line-2" }),
    ]);

    expect(match.delivery).toBe("AWAITING");
  });

  it("treats a fractional quantity as complete", () => {
    // 12.5 m³ of concrete is an ordinary order, and the stored Decimal has
    // three places. Equality on doubles is what EPSILON exists to avoid.
    const concrete = line({ quantity: 12.5, unit: "m³", unitPriceCents: 1_450_00 });
    const match = matchLine(concrete, [received(7.25), received(5.25)]);

    expect(match.delivery).toBe("COMPLETE");
  });

  it("values what arrived, not what was ordered", () => {
    const match = matchLine(line(), [received(4)]);

    expect(match.orderedCents).toBe(18_500_00);
    expect(match.receivedCents).toBe(7_400_00);
  });
});

describe("a line's value", () => {
  it("rounds a fractional cent rather than carrying it", () => {
    // 0.333 × 1000c = 333c exactly; 0.3335 × 1001c is where it matters.
    expect(lineValueCents(0.333, 1000)).toBe(333);
    expect(lineValueCents(12.5, 1_450_00)).toBe(18_125_00);
  });
});

describe("tolerance", () => {
  it("allows a few cents of rounding on a small order", () => {
    expect(withinTolerance(40, 400_00)).toBe(true);
  });

  it("does not allow a few rand of drift on a small order", () => {
    expect(withinTolerance(500, 400_00)).toBe(false);
  });

  it("scales with the order, so a large one is not queried over cents", () => {
    // 0.5% of R2m is R10 000, which is the point: the percentage governs.
    expect(withinTolerance(80_00, 2_000_000_00)).toBe(true);
  });

  it("takes the larger of the two allowances, not the smaller", () => {
    // R1 flat beats 0.5% of R50 — otherwise a tiny order can never match.
    expect(withinTolerance(100, 50_00)).toBe(true);
  });

  it("is symmetrical: being under-billed is within tolerance too", () => {
    expect(withinTolerance(-40, 400_00)).toBe(true);
  });

  it("can be tightened by whoever is paying", () => {
    expect(withinTolerance(40, 400_00, { cents: 1, fraction: 0 })).toBe(false);
  });
});

describe("the whole order", () => {
  const lines = [
    line(),
    line({ id: "line-2", description: "Ready-mix 25MPa", unit: "m³", quantity: 12, unitPriceCents: 1_450_00 }),
  ];

  it("has nothing wrong with it before anything happens", () => {
    const match = matchOrder(lines, [], []);

    expect(match.delivery).toBe("AWAITING");
    expect(match.billing).toBe("NOT_INVOICED");
    expect(match.settled).toBe(false);
    expect(match.orderedCents).toBe(18_500_00 + 17_400_00);
  });

  it("is part delivered while any line is outstanding", () => {
    const match = matchOrder(
      lines,
      [received(10), received(6, { purchaseOrderLineId: "line-2" })],
      [],
    );

    expect(match.delivery).toBe("PART");
  });

  it("is complete only when every line is", () => {
    const match = matchOrder(
      lines,
      [received(10), received(12, { purchaseOrderLineId: "line-2" })],
      [],
    );

    expect(match.delivery).toBe("COMPLETE");
  });

  it("reports over-delivery even when the other lines are fine", () => {
    const match = matchOrder(
      lines,
      [received(10), received(13, { purchaseOrderLineId: "line-2" })],
      [],
    );

    expect(match.delivery).toBe("OVER");
  });

  it("matches an invoice against what was delivered", () => {
    const match = matchOrder(
      lines,
      [received(10), received(12, { purchaseOrderLineId: "line-2" })],
      [invoice(18_500_00 + 17_400_00)],
    );

    expect(match.billing).toBe("MATCHED");
    expect(match.settled).toBe(true);
    expect(match.overBilledCents).toBe(0);
  });

  it("catches being billed for goods still on the supplier's yard", () => {
    // Half delivered, invoiced in full. This is the one the whole module is
    // for: matched against the *order* this would have read as correct.
    const match = matchOrder(lines, [received(5)], [invoice(18_500_00)]);

    expect(match.billing).toBe("OVER");
    expect(match.overBilledCents).toBe(9_250_00);
    expect(match.settled).toBe(false);
  });

  it("reads a partial invoice as more to come, not as an error", () => {
    const match = matchOrder(
      lines,
      [received(10), received(12, { purchaseOrderLineId: "line-2" })],
      [invoice(18_500_00)],
    );

    expect(match.billing).toBe("PART");
    expect(match.overBilledCents).toBe(0);
  });

  it("adds several invoices against one order", () => {
    const match = matchOrder(
      lines,
      [received(10), received(12, { purchaseOrderLineId: "line-2" })],
      [invoice(18_500_00), invoice(17_400_00, { id: "inv-2", invoiceNumber: "INV-8902" })],
    );

    expect(match.billing).toBe("MATCHED");
    expect(match.settled).toBe(true);
  });

  it("counts a disputed invoice as claimed, and says it is disputed", () => {
    // Dropping it would make an order whose only invoice is in dispute read
    // as "nothing billed", which is the opposite of what is happening.
    const match = matchOrder(
      lines,
      [received(5)],
      [invoice(18_500_00, { disputed: true })],
    );

    expect(match.invoicedCents).toBe(18_500_00);
    expect(match.disputedInvoices).toEqual(["INV-8891"]);
  });

  it("is not settled while a line is over-delivered, however it was billed", () => {
    const match = matchOrder(
      [line()],
      [received(11)],
      [invoice(lineValueCents(11, 1_850_00))],
    );

    expect(match.billing).toBe("MATCHED");
    expect(match.settled).toBe(false);
  });

  it("has an order with no lines settle rather than hang", () => {
    // An order somebody opened and never filled in. Nothing is owed on it.
    const match = matchOrder([], [], []);

    expect(match.delivery).toBe("COMPLETE");
    expect(match.orderedCents).toBe(0);
  });
});

describe("what a buyer is told", () => {
  it("says nothing about an order that is going to plan", () => {
    const match = matchOrder(
      [line()],
      [received(10)],
      [invoice(18_500_00)],
    );

    expect(concerns(match)).toEqual([]);
  });

  it("leads with the over-billing, not with the outstanding line", () => {
    const match = matchOrder(
      [
        line(),
        line({ id: "line-2", description: "Ready-mix 25MPa", unit: "m³", quantity: 12 }),
      ],
      [received(10)],
      [invoice(28_500_00)],
    );

    expect(concerns(match)[0]).toContain("more than has been delivered");
  });

  it("names the line when only one is outstanding", () => {
    const match = matchOrder([line()], [received(4)], []);

    expect(concerns(match)).toEqual([
      "6 tonnes of Y12 reinforcing bar still to come",
    ]);
  });

  it("counts them when several are", () => {
    const match = matchOrder(
      [line(), line({ id: "line-2", description: "Ready-mix 25MPa" })],
      [],
      [],
    );

    expect(concerns(match)).toEqual(["2 lines still to come"]);
  });

  it("mentions what was sent back", () => {
    const match = matchOrder(
      [line()],
      [received(10, { rejectedQuantity: 2 })],
      [],
    );

    expect(concerns(match).some((note) => note.includes("sent back"))).toBe(true);
  });

  it("mentions an over-delivery by name", () => {
    const match = matchOrder([line()], [received(12)], []);

    expect(concerns(match)[0]).toBe(
      "More arrived than was ordered on Y12 reinforcing bar",
    );
  });
});

describe("saying it in words", () => {
  it("drops the stored decimal's trailing zeroes", () => {
    expect(describeQuantity(12.5, "m³")).toBe("12.5 m³");
  });

  it("pluralises a unit that is an ordinary word", () => {
    // "14 day of compactor hire" is how a machine writes, not a buyer.
    expect(describeQuantity(14, "day")).toBe("14 days");
    expect(describeQuantity(10, "tonne")).toBe("10 tonnes");
    expect(describeQuantity(1, "day")).toBe("1 day");
  });

  it("leaves a symbol alone, because kg and m³ take no s", () => {
    expect(describeQuantity(12.5, "m³")).toBe("12.5 m³");
    expect(describeQuantity(40, "kg")).toBe("40 kg");
    expect(describeQuantity(250, "m")).toBe("250 m");
  });

  it("leaves the units that have no plural alone", () => {
    // "each" is the default unit, so it is the one this would most often
    // get wrong.
    expect(describeQuantity(40, "each")).toBe("40 each");
    expect(describeQuantity(2, "lot")).toBe("2 lot");
  });
});

describe("the default tolerance", () => {
  it("is tight enough that a real discrepancy is not waved through", () => {
    // R100 out on a R10 000 order is 1%, twice the allowance.
    expect(withinTolerance(100_00, 10_000_00, DEFAULT_TOLERANCE)).toBe(false);
  });
});
