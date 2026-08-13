import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { crmService } from "@/modules/crm/crm.service";
import {
  bidFunnel,
  clientTrackRecord,
  customerDealHistory,
  industryTrackRecord,
  monthlyBidTrend,
  opportunityReportFacts,
  tenderReportFacts,
  winLossByClient,
  winLossByIndustry,
  winLossByValueBand,
} from "@/lib/analytics/reporting";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * Opportunity and tender level reporting.
 *
 * These queries are raw SQL, which means they bypass the tenancy extension and
 * carry organisationId themselves. That is the risk worth testing hardest, so
 * a second tenant is seeded in every relevant case rather than only in the
 * isolation suite — a reporting query that leaks is a reporting query that
 * shows one contractor another's bid book.
 */

let org: SeededOrg;
let other: SeededOrg;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

/** A tender written straight to the database, so outcomes can be backdated. */
async function makeTender(
  organisationId: string,
  data: {
    reference: string;
    title?: string;
    status?:
      | "IDENTIFIED"
      | "IN_PROGRESS"
      | "SUBMITTED"
      | "WON"
      | "LOST"
      | "NO_BID";
    industry?: string;
    customerId?: string;
    estimatedValueCents?: bigint;
    awardedValueCents?: bigint;
    closingAt?: Date;
    submittedAt?: Date;
    outcomeAt?: Date;
  },
) {
  return rawDb.tender.create({
    data: {
      organisationId,
      reference: data.reference,
      title: data.title ?? data.reference,
      status: data.status ?? "IDENTIFIED",
      industry: data.industry,
      customerId: data.customerId,
      estimatedValueCents: data.estimatedValueCents,
      awardedValueCents: data.awardedValueCents,
      closingAt: data.closingAt ?? days(20),
      submittedAt: data.submittedAt,
      outcomeAt: data.outcomeAt,
    },
  });
}

async function makeCustomer(organisationId: string, name: string, isPublicSector = true) {
  return rawDb.customer.create({
    data: { organisationId, name, isPublicSector },
  });
}

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
  other = await seedOrganisation("Kgosi Civils");
});

afterAll(async () => {
  await rawDb.$disconnect();
});

describe("bid funnel", () => {
  it("counts cumulatively, so a won bid is also a submitted one", async () => {
    await makeTender(org.organisationId, { reference: "A", status: "IDENTIFIED" });
    await makeTender(org.organisationId, { reference: "B", status: "NO_BID" });
    await makeTender(org.organisationId, { reference: "C", status: "SUBMITTED" });
    await makeTender(org.organisationId, { reference: "D", status: "WON" });
    await makeTender(org.organisationId, { reference: "E", status: "LOST" });

    const funnel = await as("executive", bidFunnel);
    const [discovered, qualified, submitted, won] = funnel;

    expect(discovered.count).toBe(5);
    // Everything except the no-bid.
    expect(qualified.count).toBe(4);
    // Submitted, won and lost all reached the buyer.
    expect(submitted.count).toBe(3);
    expect(won.count).toBe(1);
  });

  it("expresses each stage as a percentage of the one above", async () => {
    await makeTender(org.organisationId, { reference: "A", status: "WON" });
    await makeTender(org.organisationId, { reference: "B", status: "LOST" });
    await makeTender(org.organisationId, { reference: "C", status: "NO_BID" });
    await makeTender(org.organisationId, { reference: "D", status: "IN_PROGRESS" });

    const funnel = await as("executive", bidFunnel);

    expect(funnel[0].conversionPercent).toBeNull();
    // 3 qualified of 4 discovered.
    expect(funnel[1].conversionPercent).toBe(75);
    // 2 submitted of 3 qualified.
    expect(funnel[2].conversionPercent).toBe(67);
    // 1 won of 2 submitted.
    expect(funnel[3].conversionPercent).toBe(50);
  });

  it("never counts another tenant's tenders", async () => {
    await makeTender(org.organisationId, { reference: "OURS", status: "WON" });
    await makeTender(other.organisationId, { reference: "THEIRS", status: "WON" });

    const funnel = await as("executive", bidFunnel);
    expect(funnel[0].count).toBe(1);
  });
});

describe("win/loss segmentation", () => {
  it("computes win rate over decided bids only", async () => {
    await makeTender(org.organisationId, {
      reference: "A",
      industry: "Electrical",
      status: "WON",
      awardedValueCents: 500_000_00n,
    });
    await makeTender(org.organisationId, {
      reference: "B",
      industry: "Electrical",
      status: "LOST",
    });
    // Open bids must not drag the rate down.
    await makeTender(org.organisationId, {
      reference: "C",
      industry: "Electrical",
      status: "IN_PROGRESS",
    });

    const [electrical] = await as("executive", winLossByIndustry);

    expect(electrical.segment).toBe("Electrical");
    expect(electrical.bids).toBe(3);
    expect(electrical.open).toBe(1);
    expect(electrical.winRatePercent).toBe(50);
    expect(electrical.wonValueCents).toBe(500_000_00n);
  });

  it("reports an undecided segment as null rather than as zero", async () => {
    await makeTender(org.organisationId, {
      reference: "A",
      industry: "Structural",
      status: "IN_PROGRESS",
    });

    const [structural] = await as("executive", winLossByIndustry);
    expect(structural.winRatePercent).toBeNull();
  });

  it("falls back to the estimate when a won bid has no awarded value", async () => {
    await makeTender(org.organisationId, {
      reference: "A",
      industry: "Electrical",
      status: "WON",
      estimatedValueCents: 900_000_00n,
    });

    const [electrical] = await as("executive", winLossByIndustry);
    expect(electrical.wonValueCents).toBe(900_000_00n);
  });

  it("groups buyers and carries whether they are an organ of state", async () => {
    const metro = await makeCustomer(org.organisationId, "City of Tshwane", true);
    const miner = await makeCustomer(org.organisationId, "Anglo", false);
    await makeTender(org.organisationId, {
      reference: "A",
      customerId: metro.id,
      status: "WON",
    });
    await makeTender(org.organisationId, {
      reference: "B",
      customerId: miner.id,
      status: "LOST",
    });

    const rows = await as("executive", winLossByClient);
    const tshwane = rows.find((r) => r.segment === "City of Tshwane");
    const anglo = rows.find((r) => r.segment === "Anglo");

    expect(tshwane?.isPublicSector).toBe(true);
    expect(tshwane?.winRatePercent).toBe(100);
    expect(anglo?.isPublicSector).toBe(false);
    expect(anglo?.winRatePercent).toBe(0);
  });

  it("bands tenders by contract size, in order", async () => {
    await makeTender(org.organisationId, {
      reference: "small",
      estimatedValueCents: 50_000_00n,
    });
    await makeTender(org.organisationId, {
      reference: "mid",
      estimatedValueCents: 8_000_000_00n,
    });
    await makeTender(org.organisationId, { reference: "unpriced" });

    const bands = await as("executive", winLossByValueBand);
    const labels = bands.map((b) => b.segment);

    expect(labels).toEqual(["Under R1m", "R5m – R20m", "Unpriced"]);
  });
});

describe("monthly trend", () => {
  it("always returns twelve months, including the empty ones", async () => {
    const trend = await as("executive", monthlyBidTrend);
    expect(trend).toHaveLength(12);
    expect(trend.every((month) => month.submitted === 0)).toBe(true);
  });

  it("attributes a bid to the month it was submitted and the month it was decided", async () => {
    await makeTender(org.organisationId, {
      reference: "A",
      status: "WON",
      submittedAt: days(-40),
      outcomeAt: days(-5),
      awardedValueCents: 100_000_00n,
    });

    const trend = await as("executive", monthlyBidTrend);
    expect(trend.reduce((n, m) => n + m.submitted, 0)).toBe(1);
    expect(trend.reduce((n, m) => n + m.won, 0)).toBe(1);
    expect(trend.at(-1)?.won).toBe(1);
  });
});

describe("tender report facts", () => {
  it("counts requirements, mandatory requirements and links", async () => {
    const customer = await makeCustomer(org.organisationId, "Metro");
    const tender = await makeTender(org.organisationId, {
      reference: "TN-1",
      customerId: customer.id,
      status: "IN_PROGRESS",
    });

    await rawDb.tenderRequirement.createMany({
      data: [
        {
          organisationId: org.organisationId,
          tenderId: tender.id,
          label: "Tax PIN",
          isMandatory: true,
          satisfiedAt: new Date(),
        },
        {
          organisationId: org.organisationId,
          tenderId: tender.id,
          label: "BBBEE",
          isMandatory: true,
        },
        {
          organisationId: org.organisationId,
          tenderId: tender.id,
          label: "Company profile",
          isMandatory: false,
        },
      ],
    });

    const facts = await as("executive", () => tenderReportFacts(tender.id));

    expect(facts.requirementsTotal).toBe(3);
    expect(facts.requirementsSatisfied).toBe(1);
    expect(facts.mandatoryTotal).toBe(2);
    expect(facts.mandatorySatisfied).toBe(1);
    expect(facts.linkedOpportunities).toBe(0);
    expect(facts.linkedProjects).toBe(0);
  });

  it("never reports a negative bid window, however the dates fall", async () => {
    // A tender captured after it closed — backdated data entry, or a seed.
    const tender = await makeTender(org.organisationId, {
      reference: "TN-2",
      status: "LOST",
      closingAt: days(-120),
      submittedAt: days(-125),
      outcomeAt: days(-100),
    });

    const facts = await as("executive", () => tenderReportFacts(tender.id));

    expect(facts.daysOpen).toBeGreaterThanOrEqual(0);
    // Earliest date held (submission, 125 days ago) to the outcome, 100 ago.
    expect(facts.daysOpen).toBe(25);
  });

  it("counts a linked opportunity and project", async () => {
    const customer = await makeCustomer(org.organisationId, "Metro");
    const tender = await makeTender(org.organisationId, {
      reference: "TN-3",
      customerId: customer.id,
      status: "WON",
    });
    await rawDb.opportunity.create({
      data: {
        organisationId: org.organisationId,
        reference: "OPP-1",
        title: "Deal",
        customerId: customer.id,
        tenderId: tender.id,
      },
    });
    await rawDb.project.create({
      data: {
        organisationId: org.organisationId,
        reference: "PRJ-1",
        name: "Delivery",
        customerId: customer.id,
        tenderId: tender.id,
      },
    });

    const facts = await as("executive", () => tenderReportFacts(tender.id));
    expect(facts.linkedOpportunities).toBe(1);
    expect(facts.linkedProjects).toBe(1);
  });
});

describe("track records", () => {
  it("excludes the bid being reported on", async () => {
    const customer = await makeCustomer(org.organisationId, "Metro");
    const current = await makeTender(org.organisationId, {
      reference: "TN-current",
      customerId: customer.id,
      status: "WON",
      awardedValueCents: 100_000_00n,
    });
    await makeTender(org.organisationId, {
      reference: "TN-past",
      customerId: customer.id,
      status: "LOST",
    });

    const record = await as("executive", () =>
      clientTrackRecord(customer.id, current.id),
    );

    expect(record.bids).toBe(1);
    expect(record.won).toBe(0);
    expect(record.lost).toBe(1);
    expect(record.winRatePercent).toBe(0);
  });

  it("includes every bid when nothing is excluded", async () => {
    const customer = await makeCustomer(org.organisationId, "Metro");
    await makeTender(org.organisationId, {
      reference: "TN-1",
      customerId: customer.id,
      status: "WON",
    });
    await makeTender(org.organisationId, {
      reference: "TN-2",
      customerId: customer.id,
      status: "LOST",
    });

    const record = await as("executive", () => clientTrackRecord(customer.id));
    expect(record.bids).toBe(2);
    expect(record.winRatePercent).toBe(50);
  });

  it("reports a sector we have never decided a bid in as null", async () => {
    await makeTender(org.organisationId, {
      reference: "TN-1",
      industry: "Marine",
      status: "IN_PROGRESS",
    });

    const record = await as("executive", () => industryTrackRecord("Marine"));
    expect(record.bids).toBe(1);
    expect(record.winRatePercent).toBeNull();
  });

  it("does not see another tenant's history with the same buyer name", async () => {
    const ours = await makeCustomer(org.organisationId, "City of Tshwane");
    const theirs = await makeCustomer(other.organisationId, "City of Tshwane");
    await makeTender(org.organisationId, {
      reference: "TN-ours",
      customerId: ours.id,
      status: "LOST",
    });
    await makeTender(other.organisationId, {
      reference: "TN-theirs",
      customerId: theirs.id,
      status: "WON",
    });

    const record = await as("executive", () => clientTrackRecord(ours.id));
    expect(record.bids).toBe(1);
    expect(record.won).toBe(0);
  });
});

describe("opportunity report facts", () => {
  it("weights the value by probability", async () => {
    const customer = await makeCustomer(org.organisationId, "Metro");
    const opportunity = await rawDb.opportunity.create({
      data: {
        organisationId: org.organisationId,
        reference: "OPP-1",
        title: "Deal",
        customerId: customer.id,
        valueCents: 1_000_000_00n,
        probability: 40,
      },
    });

    const facts = await as("executive", () =>
      opportunityReportFacts(opportunity.id),
    );

    expect(facts.weightedValueCents).toBe(400_000_00n);
  });

  it("reports a deal nobody has touched as having no last activity", async () => {
    const customer = await makeCustomer(org.organisationId, "Metro");
    const opportunity = await rawDb.opportunity.create({
      data: {
        organisationId: org.organisationId,
        reference: "OPP-1",
        title: "Deal",
        customerId: customer.id,
      },
    });

    const facts = await as("executive", () =>
      opportunityReportFacts(opportunity.id),
    );

    expect(facts.activities).toBe(0);
    expect(facts.lastActivityAt).toBeNull();
    expect(facts.daysSinceLastActivity).toBeNull();
  });

  it("counts logged activity and other open deals with the same client", async () => {
    const customer = await makeCustomer(org.organisationId, "Metro");
    const opportunity = await as("sales_manager", () =>
      crmService.createOpportunity({
        title: "Deal",
        customerId: customer.id,
        valueRands: 500_000,
      }),
    );
    await as("sales_manager", () =>
      crmService.createOpportunity({
        title: "Second deal",
        customerId: customer.id,
        valueRands: 100_000,
      }),
    );
    await as("sales_manager", () =>
      crmService.logActivity({
        entityType: "OPPORTUNITY",
        entityId: opportunity.id,
        type: "CALL",
        subject: "Spoke to the client",
      }),
    );

    const facts = await as("executive", () =>
      opportunityReportFacts(opportunity.id),
    );

    expect(facts.activities).toBe(1);
    expect(facts.lastActivityAt).not.toBeNull();
    expect(facts.siblingOpenDeals).toBe(1);
  });
});

describe("customer deal history", () => {
  it("summarises won, lost and open deals excluding the one being reported", async () => {
    const customer = await makeCustomer(org.organisationId, "Metro");
    const current = await rawDb.opportunity.create({
      data: {
        organisationId: org.organisationId,
        reference: "OPP-current",
        title: "Current",
        customerId: customer.id,
        stage: "PROPOSAL",
      },
    });
    await rawDb.opportunity.create({
      data: {
        organisationId: org.organisationId,
        reference: "OPP-won",
        title: "Won",
        customerId: customer.id,
        stage: "WON",
        valueCents: 250_000_00n,
        closedAt: days(-10),
      },
    });
    await rawDb.opportunity.create({
      data: {
        organisationId: org.organisationId,
        reference: "OPP-lost",
        title: "Lost",
        customerId: customer.id,
        stage: "LOST",
        closedAt: days(-20),
      },
    });

    const history = await as("executive", () =>
      customerDealHistory(customer.id, current.id),
    );

    expect(history.won).toBe(1);
    expect(history.lost).toBe(1);
    expect(history.open).toBe(0);
    expect(history.winRatePercent).toBe(50);
    expect(history.wonValueCents).toBe(250_000_00n);
    expect(history.medianDaysToClose).not.toBeNull();
  });

  it("returns a null win rate for a client with nothing decided", async () => {
    const customer = await makeCustomer(org.organisationId, "Metro");
    await rawDb.opportunity.create({
      data: {
        organisationId: org.organisationId,
        reference: "OPP-1",
        title: "Open",
        customerId: customer.id,
        stage: "QUALIFIED",
      },
    });

    const history = await as("executive", () => customerDealHistory(customer.id));
    expect(history.winRatePercent).toBeNull();
    expect(history.medianDaysToClose).toBeNull();
  });
});

describe("soft-deleted records", () => {
  it("drops out of every reporting cut", async () => {
    const tender = await makeTender(org.organisationId, {
      reference: "TN-1",
      industry: "Electrical",
      status: "WON",
    });
    await withRequestContext(
      { organisationId: org.organisationId, userId: org.userIds.executive },
      () => db.tender.delete({ where: { id: tender.id } }),
    );

    const funnel = await as("executive", bidFunnel);
    const industries = await as("executive", winLossByIndustry);

    expect(funnel[0].count).toBe(0);
    expect(industries).toHaveLength(0);
  });
});
