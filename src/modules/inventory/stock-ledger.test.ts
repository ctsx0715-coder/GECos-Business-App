import { describe, expect, it } from "vitest";
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
} from "./stock-ledger";
import { formatCentsExact } from "@/lib/format";

/**
 * The cases worth testing are the ones a storeman actually hits.
 *
 * Stock arriving and leaving in the order somebody expected is the least
 * interesting thing here and gets one test. The rest is what goes wrong: the
 * issue that takes the balance below zero, the delivery captured three days
 * late, the material returned from a site at a price nobody recorded, and the
 * count that finds eleven bags where the ledger swore there were forty.
 */

const YARD = "loc-yard";
const SITE = "loc-site";

let sequence = 0;

function at(day: number): Date {
  return new Date(Date.UTC(2026, 2, day, 8, 0, 0));
}

function received(
  quantity: number,
  unitCostCents: number,
  day: number,
  toLocationId = YARD,
): Movement {
  return {
    id: `mov-${++sequence}`,
    kind: "RECEIPT",
    fromLocationId: null,
    toLocationId,
    quantity,
    unitCostCents,
    movedAt: at(day),
  };
}

function issued(quantity: number, day: number, fromLocationId = YARD): Movement {
  return {
    id: `mov-${++sequence}`,
    kind: "ISSUE",
    fromLocationId,
    toLocationId: null,
    quantity,
    unitCostCents: null,
    movedAt: at(day),
  };
}

function returned(quantity: number, day: number, toLocationId = YARD): Movement {
  return {
    id: `mov-${++sequence}`,
    kind: "RETURN",
    fromLocationId: null,
    toLocationId,
    quantity,
    unitCostCents: null,
    movedAt: at(day),
  };
}

function transferred(quantity: number, day: number): Movement {
  return {
    id: `mov-${++sequence}`,
    kind: "TRANSFER",
    fromLocationId: YARD,
    toLocationId: SITE,
    quantity,
    unitCostCents: null,
    movedAt: at(day),
  };
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    name: "Cement 42.5N 50kg",
    unit: "bag",
    reorderLevel: 100,
    reorderQuantity: 200,
    ...overrides,
  };
}

describe("replay", () => {
  it("adds up what came in and what went out", () => {
    const position = replay([
      received(500, 12_500, 1),
      issued(120, 2),
      issued(80, 3),
    ]);

    expect(position.quantity).toBe(300);
    expect(position.unitCostCents).toBe(12_500);
    expect(position.valueCents).toBe(300 * 12_500);
  });

  it("has nothing to say about an item nothing has happened to", () => {
    const position = replay([]);

    expect(position.quantity).toBe(0);
    expect(position.valueCents).toBe(0);
    expect(position.lastMovedAt).toBeNull();
    expect(position.wentNegative).toBe(false);
  });

  it("averages two deliveries bought at different prices", () => {
    // 100 at R125 and 100 at R145 is 200 at R135, and everything issued
    // afterwards leaves at R135 whichever pallet it physically came off.
    const position = replay([received(100, 12_500, 1), received(100, 14_500, 2)]);

    expect(position.quantity).toBe(200);
    expect(position.unitCostCents).toBe(13_500);
  });

  it("issues at the average in force at the time, not at today's", () => {
    // The 50 bags that went out on the 2nd left before the price rise. If the
    // ledger valued them at the later average, the site would be charged for a
    // price increase that had not happened when the material was drawn.
    const position = replay([
      received(100, 12_500, 1),
      issued(50, 2),
      received(100, 20_000, 3),
    ]);

    // 50 left at R125 → 50 × R125 remaining, plus 100 × R200.
    expect(position.quantity).toBe(150);
    expect(position.valueCents).toBe(50 * 12_500 + 100 * 20_000);
  });

  it("replays in the order things happened, not the order they were typed", () => {
    // A delivery signed for on the 1st and captured on the 4th still belongs
    // on the 1st. Both orderings must land on the same balance and the same
    // average, or a late capture quietly changes what a site was charged.
    const inOrder = replay([received(100, 12_500, 1), issued(40, 2)]);
    const backwards = replay([issued(40, 2), received(100, 12_500, 1)]);

    expect(backwards.quantity).toBe(inOrder.quantity);
    expect(backwards.valueCents).toBe(inOrder.valueCents);
    expect(backwards.wentNegative).toBe(false);
  });

  it("keeps stock per store, and a transfer moves it without consuming it", () => {
    const position = replay([received(500, 12_500, 1), transferred(200, 2)]);

    expect(position.quantity).toBe(500);
    expect(position.byLocation.get(YARD)).toBe(300);
    expect(position.byLocation.get(SITE)).toBe(200);
    // The value of what we own is untouched: it is the same cement, in a
    // different shed.
    expect(position.valueCents).toBe(500 * 12_500);
    expect(position.unitCostCents).toBe(12_500);
  });

  it("lets the balance go below zero rather than pretending it did not", () => {
    // Forty bags left a store the ledger said held thirty. The yard is not
    // wrong — a delivery has not been captured. Clamping this at zero would
    // hide that, and would then overstate the balance by ten once the missing
    // delivery finally arrives.
    const position = replay([received(30, 12_500, 1), issued(40, 2)]);

    expect(position.quantity).toBe(-10);
    expect(position.wentNegative).toBe(true);
  });

  it("comes right on its own when the missing delivery is finally recorded", () => {
    const position = replay([
      received(30, 12_500, 1),
      issued(40, 2),
      // The load nobody captured, entered on the day somebody noticed —
      // which is what actually happens, because by then nobody remembers
      // when it came.
      received(100, 12_500, 3),
    ]);

    expect(position.quantity).toBe(90);
    expect(position.valueCents).toBe(90 * 12_500);
    // The balance is fine now and the impossible week is still on the record,
    // which is the point: somebody should go and ask what that delivery note
    // was actually dated.
    expect(position.wentNegative).toBe(true);
  });

  it("leaves no trace when the late delivery is dated correctly", () => {
    // The same missing load, entered with the date it actually arrived. The
    // balance never dipped in reality — only the ledger was behind — so there
    // is nothing here for anybody to investigate, and saying otherwise would
    // send a manager to the store over a capture delay.
    const position = replay([
      received(30, 12_500, 2),
      issued(40, 3),
      received(100, 12_500, 1),
    ]);

    expect(position.quantity).toBe(90);
    expect(position.wentNegative).toBe(false);
  });

  it("brings a return back at the last price we knew", () => {
    // Material coming back off a site has no price on it. Valuing it at zero
    // would write it off on the way in, which is how a store ends up holding
    // eight hundred bags worth nothing.
    const position = replay([
      received(100, 12_500, 1),
      issued(100, 2),
      returned(20, 3),
    ]);

    expect(position.quantity).toBe(20);
    expect(position.valueCents).toBe(20 * 12_500);
    expect(position.unitCostCents).toBe(12_500);
  });

  it("remembers the last price after the shelf has been emptied", () => {
    const position = replay([received(50, 12_500, 1), issued(50, 2)]);

    expect(position.quantity).toBe(0);
    expect(position.valueCents).toBe(0);
    // Nothing on hand, but the next issue and the next count still need a
    // figure, and zero would silently value them at nothing.
    expect(position.unitCostCents).toBe(12_500);
  });

  it("handles a fractional quantity without drifting", () => {
    // Readymix is ordered in cubic metres and poured in fractions of one.
    const position = replay([
      received(12.5, 1_450_00, 1),
      issued(4.25, 2),
      issued(3.75, 3),
    ]);

    expect(position.quantity).toBeCloseTo(4.5, 3);
    expect(position.valueCents).toBe(Math.round(4.5 * 1_450_00));
  });
});

describe("stockLevel", () => {
  it("says nothing about an item nobody has set a level for", () => {
    const position = replay([received(5, 12_500, 1)]);

    // Not "low". Nobody said what low is, and guessing fills a buyer's list
    // with things that are fine.
    expect(stockLevel(item({ reorderLevel: null }), position)).toBe("UNSET");
  });

  it("separates being low from being out", () => {
    expect(stockLevel(item(), replay([received(500, 12_500, 1)]))).toBe("OK");
    expect(
      stockLevel(item(), replay([received(500, 12_500, 1), issued(420, 2)])),
    ).toBe("LOW");
    expect(
      stockLevel(item(), replay([received(500, 12_500, 1), issued(500, 2)])),
    ).toBe("OUT");
  });

  it("counts sitting exactly on the level as low", () => {
    // The level is the point at which to buy, not the point after which to.
    const position = replay([received(100, 12_500, 1)]);
    expect(stockLevel(item({ reorderLevel: 100 }), position)).toBe("LOW");
  });

  it("reads an empty shelf as out even when no level was set", () => {
    expect(stockLevel(item({ reorderLevel: null }), replay([]))).toBe("OUT");
  });
});

describe("suggestedOrderQuantity", () => {
  it("covers the shortfall and the reorder quantity on top", () => {
    const position = replay([received(500, 12_500, 1), issued(440, 2)]);
    // 40 short of the level of 100, plus the 200 the item says to buy.
    expect(suggestedOrderQuantity(item(), position)).toBe(240);
  });

  it("rounds up, because half a bag is not a thing anybody can buy", () => {
    const position = replay([received(10.4, 12_500, 1)]);
    expect(
      suggestedOrderQuantity(
        item({ reorderLevel: 20, reorderQuantity: null }),
        position,
      ),
    ).toBe(10);
  });

  it("suggests nothing for an item nobody set a level or a quantity for", () => {
    const position = replay([received(1, 12_500, 1)]);
    expect(
      suggestedOrderQuantity(
        item({ reorderLevel: null, reorderQuantity: null }),
        position,
      ),
    ).toBeNull();
  });
});

describe("concerns", () => {
  it("puts an impossible balance ahead of an empty shelf", () => {
    const position = replay([received(30, 12_500, 1), issued(40, 2)]);
    const found = concerns(item(), position);

    expect(found[0]).toContain("never recorded");
  });

  it("says what to order when an item is running low", () => {
    const position = replay([received(500, 12_500, 1), issued(440, 2)]);
    const found = concerns(item(), position);

    expect(found[0]).toBe("Down to 60 bags — order 240 bags");
  });

  it("still flags a balance that was negative and has since come right", () => {
    const position = replay([
      received(30, 12_500, 1),
      issued(40, 2),
      received(100, 12_500, 3),
    ]);

    expect(concerns(item(), position)[0]).toContain("recorded late");
  });

  it("has nothing to say about an item that is fine", () => {
    expect(concerns(item(), replay([received(500, 12_500, 1)]))).toEqual([]);
  });
});

describe("countVariance", () => {
  const cost = () => 12_500;

  it("reports a shortfall against what the ledger expected", () => {
    const variance = countVariance(
      [{ stockItemId: "item-1", countedQuantity: 11, expectedQuantity: 40 }],
      cost,
    );

    expect(variance.discrepancies).toHaveLength(1);
    expect(variance.lines[0].varianceQuantity).toBe(-29);
    expect(variance.shortfallCents).toBe(29 * 12_500);
    expect(variance.netCents).toBe(-29 * 12_500);
  });

  it("keeps a shortfall and a surplus apart instead of netting them off", () => {
    // Four thousand rand short on cement and four thousand over on sand nets
    // to zero and is two serious problems, not none.
    const variance = countVariance(
      [
        { stockItemId: "item-1", countedQuantity: 8, expectedQuantity: 40 },
        { stockItemId: "item-2", countedQuantity: 72, expectedQuantity: 40 },
      ],
      cost,
    );

    expect(variance.netCents).toBe(0);
    expect(variance.shortfallCents).toBe(32 * 12_500);
    expect(variance.surplusCents).toBe(32 * 12_500);
    // Built from the same formatter rather than typed out, because the
    // en-ZA currency format uses a non-breaking space and a hand-written
    // literal only ever looks identical.
    expect(describeVariance(variance)).toBe(
      `${formatCentsExact(32 * 12_500)} short, ${formatCentsExact(32 * 12_500)} over across 2 lines`,
    );
  });

  it("does not count a line that agrees as a discrepancy", () => {
    const variance = countVariance(
      [
        { stockItemId: "item-1", countedQuantity: 40, expectedQuantity: 40 },
        { stockItemId: "item-2", countedQuantity: 39, expectedQuantity: 40 },
      ],
      cost,
    );

    expect(variance.lines).toHaveLength(2);
    expect(variance.discrepancies).toHaveLength(1);
  });

  it("says so plainly when a count found nothing wrong", () => {
    const variance = countVariance(
      [{ stockItemId: "item-1", countedQuantity: 40, expectedQuantity: 40 }],
      cost,
    );

    expect(describeVariance(variance)).toBe("Every line agrees with the ledger");
  });

  it("values each line at its own item's cost", () => {
    const costs: Record<string, number> = { "item-1": 12_500, "item-2": 90_000 };
    const variance = countVariance(
      [
        { stockItemId: "item-1", countedQuantity: 0, expectedQuantity: 10 },
        { stockItemId: "item-2", countedQuantity: 0, expectedQuantity: 10 },
      ],
      (id) => costs[id],
    );

    expect(variance.shortfallCents).toBe(10 * 12_500 + 10 * 90_000);
  });
});

describe("the ledger against a store's week", () => {
  /**
   * One item through a plausible week, because the individual rules above can
   * each hold while the sequence still lands somewhere wrong.
   */
  it("survives a delivery, two issues, a transfer, a return and a count", () => {
    const movements: Movement[] = [
      received(500, 12_500, 1),
      issued(120, 2),
      transferred(200, 3),
      issued(60, 4, SITE),
      returned(15, 5, SITE),
      received(200, 13_000, 6),
    ];

    const position: Position = replay(movements);

    // 500 in, 120 out, 60 out, 15 back, 200 in.
    expect(position.quantity).toBe(535);
    expect(position.byLocation.get(YARD)).toBe(380);
    expect(position.byLocation.get(SITE)).toBe(155);
    expect(position.wentNegative).toBe(false);

    // Every bag is accounted for in one of the two stores.
    const stored = [...position.byLocation.values()].reduce((a, b) => a + b, 0);
    expect(stored).toBe(position.quantity);

    const variance = countVariance(
      [
        {
          stockItemId: "item-1",
          countedQuantity: 374,
          expectedQuantity: position.byLocation.get(YARD)!,
        },
      ],
      () => position.unitCostCents,
    );

    expect(variance.lines[0].varianceQuantity).toBe(-6);
    expect(variance.shortfallCents).toBeGreaterThan(0);
  });
});
