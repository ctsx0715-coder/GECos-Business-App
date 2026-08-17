import { z } from "zod";

/**
 * What a form is allowed to send about an incident.
 *
 * The report form is deliberately short. It is filled in by a foreman on a
 * phone, often standing next to the thing that just happened, and every field
 * added to it is a field somebody decides to do later and then never does. So
 * what is required here is only what cannot be reconstructed afterwards: when,
 * what kind, and what happened. Everything else — the root cause, the days off
 * work, the corrective actions — is filled in during the investigation, by
 * somebody sitting down.
 */

const INCIDENT_KINDS = [
  "NEAR_MISS",
  "PROPERTY_DAMAGE",
  "ENVIRONMENTAL",
  "FIRST_AID",
  "MEDICAL_TREATMENT",
  "LOST_TIME",
  "PERMANENT_DISABILITY",
  "FATALITY",
] as const;

/** Kinds where somebody was hurt, so the form must say who. */
const INJURY_KINDS = new Set<string>([
  "FIRST_AID",
  "MEDICAL_TREATMENT",
  "LOST_TIME",
  "PERMANENT_DISABILITY",
  "FATALITY",
]);

const CONTROL_TYPES = [
  "ELIMINATION",
  "SUBSTITUTION",
  "ENGINEERING",
  "ADMINISTRATIVE",
  "PPE",
] as const;

export const reportIncidentSchema = z
  .object({
    kind: z.enum(INCIDENT_KINDS),
    occurredAt: z.coerce.date(),
    projectId: z.uuid().optional(),
    place: z.string().trim().max(200).optional(),
    injuredEmployeeId: z.uuid().optional(),
    injuredPersonName: z.string().trim().max(200).optional(),
    description: z
      .string()
      .trim()
      .min(10, "Say what happened, in a sentence or two."),
    immediateAction: z.string().trim().max(2000).optional(),
    daysUnableToWork: z.number().int().min(0).max(3650).optional(),
    dangerousOccurrence: z.boolean().default(false),
  })
  .refine((data) => data.occurredAt <= new Date(), {
    message: "That is in the future.",
    path: ["occurredAt"],
  })
  .refine(
    (data) =>
      !INJURY_KINDS.has(data.kind) ||
      data.injuredEmployeeId !== undefined ||
      (data.injuredPersonName?.length ?? 0) > 0,
    {
      // An injury with nobody attached to it cannot be reported to the
      // Compensation Fund, cannot become sick leave and cannot be followed up.
      message: "Say who was hurt — one of ours, or a name.",
      path: ["injuredEmployeeId"],
    },
  );

export type ReportIncidentData = z.output<typeof reportIncidentSchema>;

/**
 * The investigation.
 *
 * The classification can be changed here, and that is the point rather than an
 * oversight: an incident logged as first aid on Tuesday becomes lost time on
 * Friday when the man does not come back, and a register that cannot follow
 * that is a register that under-reports by design.
 */
export const investigateIncidentSchema = z.object({
  incidentId: z.uuid(),
  kind: z.enum(INCIDENT_KINDS).optional(),
  rootCause: z.string().trim().max(5000).optional(),
  daysUnableToWork: z.number().int().min(0).max(3650).nullish(),
  dangerousOccurrence: z.boolean().optional(),
  place: z.string().trim().max(200).optional(),
});

/** Recording that a statutory filing has actually been made. */
export const recordFilingSchema = z.object({
  incidentId: z.uuid(),
  to: z.enum(["DEPARTMENT", "FUND"]),
  filedAt: z.coerce.date(),
  externalReference: z.string().trim().max(100).optional(),
});

export const addActionSchema = z.object({
  incidentId: z.uuid(),
  description: z.string().trim().min(5, "Say what is going to be done."),
  control: z.enum(CONTROL_TYPES),
  assignedToEmployeeId: z.uuid().optional(),
  dueAt: z.coerce.date(),
});

export const completeActionSchema = z.object({
  actionId: z.uuid(),
  completedNote: z.string().trim().max(2000).optional(),
});

export const closeIncidentSchema = z.object({
  incidentId: z.uuid(),
  rootCause: z.string().trim().max(5000).optional(),
});
