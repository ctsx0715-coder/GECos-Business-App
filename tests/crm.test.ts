import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { ForbiddenError } from "@/lib/errors";
import { crmService } from "@/modules/crm/crm.service";
import { crmSummary, pipelineByStage } from "@/lib/analytics/metrics";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * CRM rules, with the emphasis on conversion.
 *
 * Conversion is where a CRM either upholds "one customer record, everywhere"
 * or quietly starts accumulating duplicates, so most of these tests are about
 * that rather than about CRUD.
 */

let org: SeededOrg;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
});

afterAll(async () => {
  await rawDb.$disconnect();
});

const lead = {
  companyName: "Rand Water",
  contactName: "Palesa Mokoena",
  email: "palesa@randwater.co.za",
  source: "REFERRAL" as const,
  estimatedValueRands: 2_400_000,
};

describe("leads", () => {
  it("allocates a reference and starts as new", async () => {
    const created = await as("sales_manager", () => crmService.createLead(lead));
    const year = new Date().getUTCFullYear();
    expect(created.reference).toBe(`LD-${year}-0001`);
    expect(created.status).toBe("NEW");
  });

  it("refuses a user without the create permission", async () => {
    await expect(
      as("employee", () => crmService.createLead(lead)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requires a reason to disqualify", async () => {
    const created = await as("sales_manager", () => crmService.createLead(lead));
    await expect(
      as("sales_manager", () =>
        crmService.disqualifyLead({ leadId: created.id, reason: "" }),
      ),
    ).rejects.toThrow();
  });
});

describe("converting a lead", () => {
  it("creates the customer and the opportunity without retyping anything", async () => {
    const created = await as("sales_manager", () => crmService.createLead(lead));

    const { opportunity, customerId } = await as("sales_manager", () =>
      crmService.convertLead({
        leadId: created.id,
        newCustomerName: "Rand Water",
        opportunityTitle: "Reservoir refurbishment",
      }),
    );

    // Value, owner and source all carry across from the lead.
    expect(opportunity.valueCents).toBe(240_000_000n);
    expect(opportunity.source).toBe("REFERRAL");
    expect(opportunity.ownerId).toBe(org.userIds.sales_manager);
    expect(opportunity.stage).toBe("QUALIFIED");

    const customer = await as("sales_manager", () =>
      crmService.getCustomer(customerId),
    );
    expect(customer.name).toBe("Rand Water");

    const after = await as("sales_manager", () => crmService.getLead(created.id));
    expect(after.status).toBe("CONVERTED");
    expect(after.convertedOpportunityId).toBe(opportunity.id);
    expect(after.convertedCustomerId).toBe(customerId);
  });

  it("attaches to an existing customer rather than duplicating it", async () => {
    const customer = await as("sales_manager", () =>
      crmService.createCustomer({ name: "Rand Water" }),
    );
    const created = await as("sales_manager", () => crmService.createLead(lead));

    const { customerId } = await as("sales_manager", () =>
      crmService.convertLead({
        leadId: created.id,
        customerId: customer.id,
        opportunityTitle: "Reservoir refurbishment",
      }),
    );

    expect(customerId).toBe(customer.id);
    const all = await as("sales_manager", () => crmService.listCustomers());
    expect(all).toHaveLength(1);
  });

  it("refuses to create a duplicate customer under an existing name", async () => {
    await as("sales_manager", () =>
      crmService.createCustomer({ name: "Rand Water" }),
    );
    const created = await as("sales_manager", () => crmService.createLead(lead));

    await expect(
      as("sales_manager", () =>
        crmService.convertLead({
          leadId: created.id,
          newCustomerName: "rand water",
          opportunityTitle: "Duplicate attempt",
        }),
      ),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects supplying both an existing customer and a new name", async () => {
    const customer = await as("sales_manager", () =>
      crmService.createCustomer({ name: "Rand Water" }),
    );
    const created = await as("sales_manager", () => crmService.createLead(lead));

    await expect(
      as("sales_manager", () =>
        crmService.convertLead({
          leadId: created.id,
          customerId: customer.id,
          newCustomerName: "Something Else",
          opportunityTitle: "Confused",
        }),
      ),
    ).rejects.toThrow();
  });

  it("carries the call history onto the opportunity", async () => {
    const created = await as("sales_manager", () => crmService.createLead(lead));
    await as("sales_manager", () =>
      crmService.logActivity({
        entityType: "LEAD",
        entityId: created.id,
        type: "CALL",
        subject: "Introductory call",
      }),
    );

    const { opportunity } = await as("sales_manager", () =>
      crmService.convertLead({
        leadId: created.id,
        newCustomerName: "Rand Water",
        opportunityTitle: "Reservoir refurbishment",
      }),
    );

    const timeline = await as("sales_manager", () =>
      crmService.activitiesFor("OPPORTUNITY", opportunity.id),
    );
    expect(timeline.map((a) => a.subject)).toEqual(["Introductory call"]);

    const onLead = await as("sales_manager", () =>
      crmService.activitiesFor("LEAD", created.id),
    );
    expect(onLead).toEqual([]);
  });

  it("refuses to convert the same lead twice", async () => {
    const created = await as("sales_manager", () => crmService.createLead(lead));
    await as("sales_manager", () =>
      crmService.convertLead({
        leadId: created.id,
        newCustomerName: "Rand Water",
        opportunityTitle: "First",
      }),
    );

    await expect(
      as("sales_manager", () =>
        crmService.convertLead({
          leadId: created.id,
          newCustomerName: "Rand Water Again",
          opportunityTitle: "Second",
        }),
      ),
    ).rejects.toThrow(/already been converted/);
  });

  it("refuses a user who can see leads but not convert them", async () => {
    const created = await as("sales_manager", () => crmService.createLead(lead));
    await expect(
      as("tender_officer", () =>
        crmService.convertLead({
          leadId: created.id,
          newCustomerName: "Rand Water",
          opportunityTitle: "Not allowed",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("opportunity stages", () => {
  async function anOpportunity(valueRands = 1_000_000) {
    const customer = await as("sales_manager", () =>
      crmService.createCustomer({ name: `Client ${Math.random()}` }),
    );
    return as("sales_manager", () =>
      crmService.createOpportunity({
        title: "Deal",
        customerId: customer.id,
        valueRands,
      }),
    );
  }

  it("moves probability with the stage unless overridden", async () => {
    const deal = await anOpportunity();

    const proposal = await as("sales_manager", () =>
      crmService.advanceStage({ opportunityId: deal.id, stage: "PROPOSAL" }),
    );
    expect(proposal.probability).toBe(50);

    const negotiation = await as("sales_manager", () =>
      crmService.advanceStage({
        opportunityId: deal.id,
        stage: "NEGOTIATION",
        probability: 90,
      }),
    );
    expect(negotiation.probability).toBe(90);
  });

  it("requires a reason when a deal is lost", async () => {
    const deal = await anOpportunity();
    await expect(
      as("sales_manager", () =>
        crmService.closeOpportunity({
          opportunityId: deal.id,
          outcome: "LOST",
        }),
      ),
    ).rejects.toThrow();
  });

  it("closes a deal won and stamps the close date", async () => {
    const deal = await anOpportunity();
    const won = await as("sales_manager", () =>
      crmService.closeOpportunity({ opportunityId: deal.id, outcome: "WON" }),
    );
    expect(won.stage).toBe("WON");
    expect(won.probability).toBe(100);
    expect(won.closedAt).toBeInstanceOf(Date);
  });

  it("refuses to edit or re-close a closed deal", async () => {
    const deal = await anOpportunity();
    await as("sales_manager", () =>
      crmService.closeOpportunity({ opportunityId: deal.id, outcome: "WON" }),
    );

    await expect(
      as("sales_manager", () =>
        crmService.advanceStage({ opportunityId: deal.id, stage: "PROPOSAL" }),
      ),
    ).rejects.toThrow(/closed/);

    await expect(
      as("sales_manager", () =>
        crmService.closeOpportunity({ opportunityId: deal.id, outcome: "LOST", lostReason: "Changed our mind" }),
      ),
    ).rejects.toThrow(/already closed/);
  });

  it("refuses to close for someone who can only edit", async () => {
    const deal = await anOpportunity();
    await expect(
      as("tender_officer", () =>
        crmService.closeOpportunity({ opportunityId: deal.id, outcome: "WON" }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("pipeline metrics", () => {
  it("weights value by probability", async () => {
    const customer = await as("sales_manager", () =>
      crmService.createCustomer({ name: "Weighted Co" }),
    );
    // R1 000 000 at 25% qualified, R2 000 000 at 50% proposal.
    const a = await as("sales_manager", () =>
      crmService.createOpportunity({
        title: "Deal A",
        customerId: customer.id,
        valueRands: 1_000_000,
        probability: 25,
      }),
    );
    const b = await as("sales_manager", () =>
      crmService.createOpportunity({
        title: "Deal B",
        customerId: customer.id,
        valueRands: 2_000_000,
        probability: 50,
      }),
    );
    await as("sales_manager", () =>
      crmService.advanceStage({
        opportunityId: b.id,
        stage: "PROPOSAL",
        probability: 50,
      }),
    );
    expect(a.id).toBeTruthy();

    const summary = await as("sales_manager", () => crmSummary());
    expect(summary.openDeals).toBe(2);
    expect(summary.openValueCents).toBe(300_000_000n);
    // 250 000 + 1 000 000 rands = 1 250 000 rands weighted
    expect(summary.weightedValueCents).toBe(125_000_000n);

    const stages = await as("sales_manager", () => pipelineByStage());
    expect(stages.map((s) => s.stage)).toEqual(["QUALIFIED", "PROPOSAL"]);
  });

  it("excludes closed deals from the open pipeline", async () => {
    const customer = await as("sales_manager", () =>
      crmService.createCustomer({ name: "Closed Co" }),
    );
    const deal = await as("sales_manager", () =>
      crmService.createOpportunity({
        title: "Closing",
        customerId: customer.id,
        valueRands: 500_000,
      }),
    );
    await as("sales_manager", () =>
      crmService.closeOpportunity({ opportunityId: deal.id, outcome: "WON" }),
    );

    const summary = await as("sales_manager", () => crmSummary());
    expect(summary.openDeals).toBe(0);
    expect(summary.wonThisYear).toBe(1);
    expect(summary.winRatePercent).toBe(100);
  });
});

describe("tenant isolation", () => {
  it("keeps opportunities and leads apart", async () => {
    await as("sales_manager", () => crmService.createLead(lead));
    const customer = await as("sales_manager", () =>
      crmService.createCustomer({ name: "Nopedi Client" }),
    );
    await as("sales_manager", () =>
      crmService.createOpportunity({
        title: "Nopedi deal",
        customerId: customer.id,
        valueRands: 100_000,
      }),
    );

    const rival = await seedOrganisation("Kgosi Civils");
    const seen = await withRequestContext(
      {
        organisationId: rival.organisationId,
        userId: rival.userIds.sales_manager,
      },
      async () => ({
        leads: await crmService.listLeads(),
        opportunities: await crmService.listOpportunities(),
        customers: await crmService.listCustomers(),
      }),
    );

    expect(seen.leads).toEqual([]);
    expect(seen.opportunities).toEqual([]);
    expect(seen.customers).toEqual([]);
  });

  it("gives each tenant its own reference sequence", async () => {
    const mine = await as("sales_manager", () => crmService.createLead(lead));
    const rival = await seedOrganisation("Kgosi Civils");
    const theirs = await withRequestContext(
      {
        organisationId: rival.organisationId,
        userId: rival.userIds.sales_manager,
      },
      () => crmService.createLead(lead),
    );

    expect(mine.reference).toBe(theirs.reference);
    expect(mine.id).not.toBe(theirs.id);
  });
});

describe("audit", () => {
  it("records conversion as a chain of changes without being asked", async () => {
    const created = await as("sales_manager", () => crmService.createLead(lead));
    await as("sales_manager", () =>
      crmService.convertLead({
        leadId: created.id,
        newCustomerName: "Rand Water",
        opportunityTitle: "Reservoir refurbishment",
      }),
    );

    const trail = await rawDb.auditLog.findMany({
      where: { entityType: { in: ["Lead", "Opportunity", "Customer"] } },
      orderBy: { createdAt: "asc" },
    });

    const summary = trail.map((row) => `${row.action} ${row.entityType}`);
    expect(summary).toContain("CREATE Lead");
    expect(summary).toContain("CREATE Customer");
    expect(summary).toContain("CREATE Opportunity");
    expect(summary).toContain("UPDATE Lead");
  });

  it("soft deletes an opportunity but keeps the row", async () => {
    const customer = await as("sales_manager", () =>
      crmService.createCustomer({ name: "Doomed Co" }),
    );
    const deal = await as("executive", () =>
      crmService.createOpportunity({
        title: "To delete",
        customerId: customer.id,
      }),
    );
    await as("executive", () => crmService.deleteOpportunity(deal.id));

    const visible = await as("sales_manager", () =>
      crmService.listOpportunities(),
    );
    expect(visible).toEqual([]);

    const row = await rawDb.opportunity.findUnique({ where: { id: deal.id } });
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});
