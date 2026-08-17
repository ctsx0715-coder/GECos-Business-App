import type { MovementKind, StockLevel } from "./stock-ledger";

/**
 * The words on the screen.
 *
 * Kept out of the components because the enum values are shouted database
 * constants, and kept in one file because the register, the item page and the
 * module's front page have to agree — a state reading "Running low" in one
 * place and "Below reorder level" in another looks like two different things.
 */

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  RECEIPT: "Delivered in",
  ISSUE: "Issued out",
  RETURN: "Returned",
  TRANSFER: "Transferred",
  ADJUSTMENT: "Corrected",
  WRITE_OFF: "Written off",
};

export const COUNT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Being counted",
  COUNTED: "Awaiting acceptance",
  ACCEPTED: "Accepted",
  ABANDONED: "Abandoned",
};

/**
 * "Not set" rather than "OK".
 *
 * An item nobody has given a reorder level to is not a healthy item, it is an
 * unanswered question — and calling it fine is how a store runs out of
 * something the register said was in order.
 */
export const LEVEL_LABELS: Record<StockLevel, string> = {
  UNSET: "No level set",
  OK: "In stock",
  LOW: "Running low",
  OUT: "None on hand",
};

export function movementTone(kind: MovementKind): Tone {
  switch (kind) {
    case "RECEIPT":
    case "RETURN":
      return "success";
    case "ISSUE":
      return "info";
    case "WRITE_OFF":
      return "danger";
    case "ADJUSTMENT":
      return "warning";
    default:
      return "neutral";
  }
}

export function countStatusTone(status: string): Tone {
  switch (status) {
    case "ACCEPTED":
      return "success";
    case "COUNTED":
      return "warning";
    case "ABANDONED":
      return "danger";
    default:
      return "neutral";
  }
}

export function levelTone(level: StockLevel): Tone {
  switch (level) {
    case "OK":
      return "success";
    case "LOW":
      return "warning";
    case "OUT":
      return "danger";
    default:
      return "neutral";
  }
}

/** Which way a movement went, for a register somebody scans down. */
export function movementDirection(movement: {
  fromLocationId: string | null;
  toLocationId: string | null;
}): "in" | "out" | "between" {
  if (movement.fromLocationId && movement.toLocationId) return "between";
  return movement.toLocationId ? "in" : "out";
}
