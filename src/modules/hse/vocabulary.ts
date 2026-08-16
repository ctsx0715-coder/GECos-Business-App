import type { IncidentKind } from "./reportability";
import type { ControlType } from "./safety-metrics";

/**
 * The words on the screen.
 *
 * Kept out of the components because the enum values are shouted database
 * constants and nobody should read `PERMANENT_DISABILITY` on a page about a
 * person. Kept in one file because the register, the incident page and the
 * dashboard must agree — a kind that reads "Lost time" in one place and
 * "Lost-time injury" in another looks like two different things.
 */

export const KIND_LABELS: Record<IncidentKind, string> = {
  NEAR_MISS: "Near miss",
  PROPERTY_DAMAGE: "Property damage",
  ENVIRONMENTAL: "Environmental",
  FIRST_AID: "First aid",
  MEDICAL_TREATMENT: "Medical treatment",
  LOST_TIME: "Lost time",
  PERMANENT_DISABILITY: "Permanent disability",
  FATALITY: "Fatality",
};

/**
 * What each kind means, in the words somebody filling in the form would use.
 *
 * On the report form these matter more than the labels do. The difference
 * between first aid and medical treatment decides whether the Compensation
 * Fund has to be told, and a foreman picking from a list of eight nouns has no
 * way of knowing that unless it says so.
 */
export const KIND_HINTS: Record<IncidentKind, string> = {
  NEAR_MISS: "Nobody was hurt and nothing was damaged, but it was close.",
  PROPERTY_DAMAGE: "Plant, a vehicle or the works damaged. Nobody hurt.",
  ENVIRONMENTAL: "A spill, a discharge or contamination.",
  FIRST_AID: "Treated from the site box. No doctor, no time off.",
  MEDICAL_TREATMENT: "Needed a doctor or a clinic, but came back to work.",
  LOST_TIME: "Could not do their normal work afterwards.",
  PERMANENT_DISABILITY: "Lost a limb, or the injury will not fully heal.",
  FATALITY: "Somebody died.",
};

/** Ordered worst-first, which is how a register of these is read. */
export const KINDS_BY_SEVERITY: IncidentKind[] = [
  "FATALITY",
  "PERMANENT_DISABILITY",
  "LOST_TIME",
  "MEDICAL_TREATMENT",
  "FIRST_AID",
  "ENVIRONMENTAL",
  "PROPERTY_DAMAGE",
  "NEAR_MISS",
];

export const CONTROL_LABELS: Record<ControlType, string> = {
  ELIMINATION: "Eliminate",
  SUBSTITUTION: "Substitute",
  ENGINEERING: "Engineer out",
  ADMINISTRATIVE: "Procedure or training",
  PPE: "Protective equipment",
};

/**
 * What each control actually means, strongest first.
 *
 * Printed next to the choice on the form because the hierarchy is the single
 * most useful idea in safety and the least known outside it. Somebody who
 * reads these while filling the form in occasionally changes their answer,
 * which is the entire point of putting them there.
 */
export const CONTROL_HINTS: Record<ControlType, string> = {
  ELIMINATION: "Stop doing the thing. Nothing beats it.",
  SUBSTITUTION: "Do it a different way, or with something safer.",
  ENGINEERING: "Guard it, isolate it, design the risk out. Works unattended.",
  ADMINISTRATIVE: "A procedure, a permit, a briefing. Depends on people remembering.",
  PPE: "The last line. Protects one person, only while worn.",
};

export const CONTROLS_BY_STRENGTH: ControlType[] = [
  "ELIMINATION",
  "SUBSTITUTION",
  "ENGINEERING",
  "ADMINISTRATIVE",
  "PPE",
];

/** A colour cue for the register. Injuries are red; the rest are not. */
export function kindTone(
  kind: IncidentKind,
): "danger" | "warning" | "info" | "neutral" {
  switch (kind) {
    case "FATALITY":
    case "PERMANENT_DISABILITY":
    case "LOST_TIME":
      return "danger";
    case "MEDICAL_TREATMENT":
    case "ENVIRONMENTAL":
      return "warning";
    case "FIRST_AID":
    case "PROPERTY_DAMAGE":
      return "info";
    default:
      return "neutral";
  }
}

/**
 * "in 3 days", "today", "6 days late".
 *
 * Relative rather than a date, because the only thing anybody wants from a
 * deadline on a list is whether it has passed.
 */
export function describeDeadline(days: number): string {
  if (days < -1) return `${Math.abs(days)} days late`;
  if (days === -1) return "1 day late";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `${days} days left`;
}
