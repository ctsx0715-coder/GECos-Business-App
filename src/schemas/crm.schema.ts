import { z } from "zod";

/**
 * CRM validation. Money arrives from forms as rands and is stored as integer
 * cents, so the conversion lives here rather than at every call site.
 */

const randsToCents = z
  .number()
  .nonnegative()
  .finite()
  .transform((rands) => BigInt(Math.round(rands * 100)));

const LEAD_SOURCES = [
  "REFERRAL",
  "WEBSITE",
  "TENDER_PORTAL",
  "COLD_OUTREACH",
  "EXISTING_CLIENT",
  "EVENT",
  "OTHER",
] as const;

// ---------------------------------------------------------------------------
// Customers and contacts
// ---------------------------------------------------------------------------

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, "Give the customer a name."),
  registrationNumber: z.string().trim().max(50).optional(),
  vatNumber: z.string().trim().max(50).optional(),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  countryCode: z.string().trim().length(2).default("ZA"),
  /// Organs of state carry extra tender compliance obligations.
  isPublicSector: z.boolean().default(false),
});

export type CreateCustomerData = z.output<typeof createCustomerSchema>;

export const createContactSchema = z.object({
  customerId: z.uuid(),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  jobTitle: z.string().trim().max(120).optional(),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateContactData = z.output<typeof createContactSchema>;

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const createLeadSchema = z.object({
  companyName: z.string().trim().min(2, "Who is the enquiry from?"),
  contactName: z.string().trim().max(160).optional(),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  source: z.enum(LEAD_SOURCES).default("OTHER"),
  sourceDetail: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  estimatedValueRands: randsToCents.optional(),
  ownerId: z.uuid().optional(),
});

export type CreateLeadData = z.output<typeof createLeadSchema>;

/**
 * Converting a lead.
 *
 * Either attach to an existing customer or create one from the lead — never
 * both, and never neither. The refinement is what stops a duplicate customer
 * being created for a client already on the books.
 */
export const convertLeadSchema = z
  .object({
    leadId: z.uuid(),
    /// Attach to this existing customer.
    customerId: z.uuid().optional(),
    /// Or create a new customer under this name.
    newCustomerName: z.string().trim().min(2).optional(),
    opportunityTitle: z.string().trim().min(3, "Name the opportunity."),
    valueRands: randsToCents.optional(),
    probability: z.number().int().min(0).max(100).default(50),
    expectedCloseAt: z.coerce.date().optional(),
  })
  .refine((data) => Boolean(data.customerId) !== Boolean(data.newCustomerName), {
    message:
      "Choose an existing customer or supply a name for a new one, not both.",
    path: ["customerId"],
  });

export type ConvertLeadData = z.output<typeof convertLeadSchema>;

export const disqualifyLeadSchema = z.object({
  leadId: z.uuid(),
  reason: z.string().trim().min(3, "Say why, so the data is worth reporting on."),
});

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export const createOpportunitySchema = z.object({
  title: z.string().trim().min(3, "Name the opportunity."),
  description: z.string().trim().max(5000).optional(),
  customerId: z.uuid(),
  contactId: z.uuid().optional(),
  ownerId: z.uuid().optional(),
  valueRands: randsToCents.optional(),
  probability: z.number().int().min(0).max(100).default(50),
  expectedCloseAt: z.coerce.date().optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  /// Links the deal to the bid it is being pursued through.
  tenderId: z.uuid().optional(),
});

export type CreateOpportunityData = z.output<typeof createOpportunitySchema>;

export const updateOpportunitySchema = createOpportunitySchema
  .partial()
  .omit({ customerId: true });

/** Moving between open stages. Closing is a separate, permissioned action. */
export const advanceStageSchema = z.object({
  opportunityId: z.uuid(),
  stage: z.enum(["QUALIFIED", "PROPOSAL", "NEGOTIATION"]),
  probability: z.number().int().min(0).max(100).optional(),
});

export const closeOpportunitySchema = z
  .object({
    opportunityId: z.uuid(),
    outcome: z.enum(["WON", "LOST"]),
    /// Required on a loss: a pipeline without loss reasons teaches nothing.
    lostReason: z.string().trim().max(2000).optional(),
    finalValueRands: randsToCents.optional(),
  })
  .refine(
    (data) => data.outcome !== "LOST" || (data.lostReason?.length ?? 0) >= 3,
    { message: "Record why the deal was lost.", path: ["lostReason"] },
  );

export type CloseOpportunityData = z.output<typeof closeOpportunitySchema>;

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const logActivitySchema = z.object({
  entityType: z.enum(["LEAD", "CUSTOMER", "CONTACT", "OPPORTUNITY", "TENDER"]),
  entityId: z.uuid(),
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "SITE_VISIT"]),
  subject: z.string().trim().min(2, "Give the activity a subject."),
  body: z.string().trim().max(5000).optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
});

export type LogActivityData = z.output<typeof logActivitySchema>;
