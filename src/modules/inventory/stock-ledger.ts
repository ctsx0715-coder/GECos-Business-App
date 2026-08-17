/**
 * What is on hand, and what it is worth.
 *
 * Stock on hand is never stored. It is the sum of the movements every time it
 * is asked, which is the same decision the purchase order took about whether
 * goods have arrived and it is taken here for the same reason: a stored
 * quantity and a movements table disagree the first time somebody backdates a
 * delivery signed for on Friday and captured on Monday, and from then on two
 * screens give two answers about how much cement is in the yard.
 *
 * No database in here, and no permission checks. Everything is arithmetic on
 * rows the caller has already loaded, which is what makes the awkward cases
 * testable without a fixture (ADR-008) — and in stock the awkward cases are
 * most of them: the issue that takes a balance below zero, the return of
 * material that was bought at a price nobody recorded, the count that finds
 * eleven bags where the ledger swore there were forty.
 *
 * Quantities are plain numbers rather than Prisma's Decimal, converted at the
 * repository boundary. They are stored as Decimal(12,3), which is well inside
 * what a double represents exactly, and comparisons go through `EPSILON`
 * rather than `===` regardless.
 *
 * Money is integer cents throughout.
 */

import { describeQuantity, formatCentsExact } from "@/lib/format";

/** Below this, two quantities are the same quantity. Three decimals stored. */
const EPSILON = 0.0005;

export type MovementKind =
  | "RECEIPT"
  | "ISSUE"
  | "RETURN"
  | "TRANSFER"
  | "ADJUSTMENT"
  | "WRITE_OFF";

/**
 * One row of the ledger.
 *
 * Direction is carried by which side has a location, not by a sign on the
 * quantity: stock coming in has a `to`, stock going out has a `from`, and a
 * transfer has both. A quantity is therefore always positive, and a negative
 * one is a bug rather than a meaning — which matters because the alternative
 * design, signed quantities, makes "issue minus three bags" a sentence the
 * type system is happy with.
 */
export interface Movement {
  id: string;
  kind: MovementKind;
  fromLocationId: string | null;
  toLocationId: string | null;
  quantity: number;
  /** Set on receipts, where the price comes off the order. Null elsewhere. */
  unitCostCents: number | null;
  movedAt: Date;
}

/** Where one item has got to, across every store. */
export interface Position {
  quantity: number;
  /** What the quantity on hand is worth, at weighted average cost. */
  valueCents: number;
  /**
   * The weighted average, or the last price we knew if nothing is on hand.
   * Never null once anything has ever been received, because the figure is
   * needed to value the next issue and guessing zero writes stock off silently.
   */
  unitCostCents: number;
  /** On hand per store. Only stores the item has been in appear. */
  byLocation: Map<string, number>;
  /**
   * True if the running balance was ever below zero, replaying in date order.
   *
   * A stronger statement than "it is negative now", and a different one. This
   * says that at some point in the sequence of things that actually happened,
   * more material left the store than had ever been in it — which is
   * impossible in a yard and means one of two things: a delivery is still
   * missing, or one was captured with the date it was typed rather than the
   * date it arrived.
   *
   * Both are worth somebody's attention, and neither is visible from today's
   * balance, because entering the missing delivery brings the balance right
   * while leaving the impossible week exactly where it was. A delivery that is
   * captured late but *dated* correctly clears this, and should: nothing
   * impossible happened, the ledger was only behind.
   */
  wentNegative: boolean;
  /** The last movement, for "nothing has touched this since March". */
  lastMovedAt: Date | null;
}

/**
 * Replays the ledger for one item.
 *
 * Weighted average cost, not FIFO. FIFO needs every issue to name the delivery
 * it came out of, and no storeman handing over twenty bags of cement knows or
 * cares which pallet they were on. Weighted average is what a contractor's
 * accountant expects to see and the only one the source data can support.
 *
 * Movements are replayed in `movedAt` order rather than the order they were
 * captured, because the average depends on the sequence: material issued
 * before a price rise left at the old average, and a delivery entered late
 * must not retrospectively make it more expensive.
 */
export function replay(movements: Movement[]): Position {
  const ordered = [...movements].sort(
    (a, b) => a.movedAt.getTime() - b.movedAt.getTime(),
  );

  let quantity = 0;
  let valueCents = 0;
  let lastKnownUnitCostCents = 0;
  let wentNegative = false;
  const byLocation = new Map<string, number>();

  function move(locationId: string | null, delta: number) {
    if (!locationId) return;
    byLocation.set(locationId, (byLocation.get(locationId) ?? 0) + delta);
  }

  for (const movement of ordered) {
    const comesIn = movement.toLocationId !== null;
    const goesOut = movement.fromLocationId !== null;

    move(movement.fromLocationId, -movement.quantity);
    move(movement.toLocationId, movement.quantity);

    // A transfer is our own stock in a different shed. Nothing was bought,
    // nothing was consumed, and the value of the item as a whole is untouched
    // — so it must not disturb the average, which valuing it in and back out
    // again at slightly different roundings would.
    if (comesIn && goesOut) continue;

    if (comesIn) {
      // A receipt brings its price with it. A return does not — the material
      // is coming back from a site that took it at whatever the average was
      // then, and reviving that figure would mean tracking every issue's cost
      // back to it. It re-enters at the last price we knew, which is right to
      // within a price rise and never invents value out of nothing.
      const unitCost = movement.unitCostCents ?? lastKnownUnitCostCents;
      quantity += movement.quantity;
      valueCents += Math.round(movement.quantity * unitCost);
      if (unitCost > 0) lastKnownUnitCostCents = unitCost;
    } else if (goesOut) {
      /*
       * What it leaves at.
       *
       * The running average while there is stock to average. Once the balance
       * is at or below zero there is nothing to divide by, so it leaves at the
       * last price we knew — which is the only figure available and is very
       * likely the right one, because a balance at zero with material still
       * physically leaving means a delivery has not been captured yet.
       */
      const unitCost =
        quantity > EPSILON
          ? Math.round(valueCents / quantity)
          : lastKnownUnitCostCents;

      quantity -= movement.quantity;
      valueCents -= Math.round(movement.quantity * unitCost);

      /*
       * Not clamped at zero, deliberately.
       *
       * A negative balance is impossible in the yard and perfectly possible in
       * the ledger, and it means one thing: something came in that nobody
       * recorded. Clamping it to zero throws that away — and worse, when the
       * missing delivery is finally captured the balance jumps to the full
       * delivered quantity instead of settling at the true remainder, so the
       * error survives the correction. Left alone, the arithmetic comes right
       * on its own the moment the receipt is entered.
       */
      if (quantity < -EPSILON) wentNegative = true;
    }
  }

  return {
    quantity,
    valueCents,
    unitCostCents:
      quantity > EPSILON
        ? Math.round(valueCents / quantity)
        : lastKnownUnitCostCents,
    byLocation,
    wentNegative,
    lastMovedAt: ordered.length > 0 ? ordered[ordered.length - 1].movedAt : null,
  };
}

// ---------------------------------------------------------------------------
// What the register says about an item
// ---------------------------------------------------------------------------

export interface Item {
  id: string;
  name: string;
  unit: string;
  /** Null means nobody has set one, which must never raise an alert. */
  reorderLevel: number | null;
  reorderQuantity: number | null;
}

/**
 * Whether an item needs buying.
 *
 * `OUT` is separate from `LOW` because they are different conversations: low
 * is a purchase order this week, out is a crew standing on a site with nothing
 * to work with. `UNSET` is neither — nobody has said what the level is, and
 * inventing one would fill a buyer's list with items that are fine.
 */
export type StockLevel = "UNSET" | "OK" | "LOW" | "OUT";

export function stockLevel(item: Item, position: Position): StockLevel {
  if (position.quantity <= EPSILON) return "OUT";
  if (item.reorderLevel === null) return "UNSET";
  return position.quantity <= item.reorderLevel + EPSILON ? "LOW" : "OK";
}

/**
 * How much to put on the next order.
 *
 * The shortfall against the reorder level plus whatever the item says to buy
 * on top, so the answer is an order somebody can place rather than a hint that
 * they should think about it. Rounded up to a whole unit: half a bag of cement
 * is not a thing anybody can buy.
 */
export function suggestedOrderQuantity(
  item: Item,
  position: Position,
): number | null {
  if (item.reorderLevel === null && item.reorderQuantity === null) return null;

  const shortfall = Math.max(0, (item.reorderLevel ?? 0) - position.quantity);
  const suggested = shortfall + (item.reorderQuantity ?? 0);
  return suggested > EPSILON ? Math.ceil(suggested) : null;
}

/**
 * What is wrong with this item, in the words somebody would use.
 *
 * Worst first, because the screens show the first one. An impossible balance
 * outranks an empty shelf: a store that has run out is a buying problem, and a
 * store whose ledger says less than nothing is a record that cannot be trusted
 * to tell anybody whether they have run out at all.
 */
export function concerns(item: Item, position: Position): string[] {
  const found: string[] = [];

  if (position.quantity < -EPSILON) {
    found.push(
      `The ledger says ${describeQuantity(position.quantity, item.unit)} — something was delivered and never recorded`,
    );
  } else if (position.wentNegative) {
    found.push(
      "The balance went below zero at some point, so a delivery was recorded late",
    );
  }

  const level = stockLevel(item, position);
  if (level === "OUT" && position.quantity >= -EPSILON) {
    found.push("None on hand");
  } else if (level === "LOW") {
    const suggested = suggestedOrderQuantity(item, position);
    found.push(
      suggested === null
        ? `Down to ${describeQuantity(position.quantity, item.unit)}`
        : `Down to ${describeQuantity(position.quantity, item.unit)} — order ${describeQuantity(suggested, item.unit)}`,
    );
  }

  return found;
}

// ---------------------------------------------------------------------------
// Stocktakes
// ---------------------------------------------------------------------------

export interface CountedLine {
  stockItemId: string;
  countedQuantity: number;
  /** What the ledger said when the count was handed in. Frozen at that point. */
  expectedQuantity: number;
}

export interface LineVariance {
  stockItemId: string;
  countedQuantity: number;
  expectedQuantity: number;
  /** Counted minus expected. Negative is stock that is not there. */
  varianceQuantity: number;
  /** What that difference is worth, at the item's average cost. */
  varianceCents: number;
}

/**
 * What a count found.
 *
 * Signed, and the sign carries the meaning: a shortfall is material that has
 * left without being recorded, and a surplus is material that arrived without
 * being recorded. Both are errors, but only one of them is the one a company
 * loses money to, so `shortfallCents` is reported separately from the net.
 * A count that is four thousand rand short on cement and four thousand over on
 * sand has a net of zero and two serious problems.
 */
export interface CountVariance {
  lines: LineVariance[];
  /** Lines where the count disagreed with the ledger at all. */
  discrepancies: LineVariance[];
  /** Net value of the whole count. Can be either sign. */
  netCents: number;
  /** The value of what is missing, as a positive number. */
  shortfallCents: number;
  /** The value of what turned up unexpectedly, as a positive number. */
  surplusCents: number;
}

export function countVariance(
  lines: CountedLine[],
  unitCostCentsFor: (stockItemId: string) => number,
): CountVariance {
  const measured: LineVariance[] = lines.map((line) => {
    const varianceQuantity = line.countedQuantity - line.expectedQuantity;
    return {
      stockItemId: line.stockItemId,
      countedQuantity: line.countedQuantity,
      expectedQuantity: line.expectedQuantity,
      varianceQuantity,
      varianceCents: Math.round(
        varianceQuantity * unitCostCentsFor(line.stockItemId),
      ),
    };
  });

  const discrepancies = measured.filter(
    (line) => Math.abs(line.varianceQuantity) > EPSILON,
  );

  return {
    lines: measured,
    discrepancies,
    netCents: measured.reduce((total, line) => total + line.varianceCents, 0),
    shortfallCents: measured.reduce(
      (total, line) => total + Math.max(0, -line.varianceCents),
      0,
    ),
    surplusCents: measured.reduce(
      (total, line) => total + Math.max(0, line.varianceCents),
      0,
    ),
  };
}

/** What a count found, for somebody deciding whether to accept it. */
export function describeVariance(variance: CountVariance): string {
  if (variance.discrepancies.length === 0) {
    return "Every line agrees with the ledger";
  }

  const parts: string[] = [];
  if (variance.shortfallCents > 0) {
    parts.push(`${formatCentsExact(variance.shortfallCents)} short`);
  }
  if (variance.surplusCents > 0) {
    parts.push(`${formatCentsExact(variance.surplusCents)} over`);
  }

  const lines =
    variance.discrepancies.length === 1
      ? "1 line"
      : `${variance.discrepancies.length} lines`;

  return `${parts.join(", ")} across ${lines}`;
}
