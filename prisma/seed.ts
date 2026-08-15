import "dotenv/config";
import { db, rawDb } from "@/lib/database/client";
import { withSystemContext } from "@/lib/database/tenant-context";
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  SYSTEM_ROLES,
  MODULES,
} from "@/lib/permissions/catalogue";
import { DEFAULT_TENDER_CHECKLIST } from "@/modules/tenders/tender.service";
import type { TenderStatus } from "@/generated/prisma/client";

/**
 * Development seed.
 *
 * Two tenants, because a single-tenant demo cannot show that isolation works.
 * The data is fake but plausible — a mid-size South African contractor, not
 * "Test Tender 1". Bad seed data is the most common reason a working demo
 * lands badly (docs/01-demo-scope.md).
 */

const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

async function seedPermissionCatalogue() {
  await rawDb.permission.createMany({
    data: ALL_PERMISSION_KEYS.map((key) => ({ key, moduleKey: PERMISSIONS[key] })),
    skipDuplicates: true,
  });
}

interface Person {
  roleKey: keyof typeof SYSTEM_ROLES;
  firstName: string;
  lastName: string;
  jobTitle: string;
}

async function seedTenant(params: {
  name: string;
  emailDomain: string;
  people: Person[];
}) {
  const organisation = await rawDb.organisation.create({
    data: {
      name: params.name,
      tradingName: params.name,
      timezone: "Africa/Johannesburg",
      currency: "ZAR",
    },
  });

  return withSystemContext(organisation.id, async () => {
    for (const moduleKey of Object.values(MODULES)) {
      await db.organisationModule.create({
        data: {
          organisationId: organisation.id,
          moduleKey,
          // Only what the skeleton actually implements is switched on (ADR-009).
          isEnabled: [
            MODULES.CORE,
            MODULES.TENDERS,
            MODULES.CRM,
            MODULES.PROJECTS,
            MODULES.DOCUMENTS,
            MODULES.REPORTS,
            MODULES.HR,
          ].includes(moduleKey as never),
        },
      });
    }

    const roleIds: Record<string, string> = {};
    for (const [key, definition] of Object.entries(SYSTEM_ROLES)) {
      const role = await db.role.create({
        data: {
          organisationId: organisation.id,
          key,
          name: definition.name,
          description: definition.description,
          isSystem: true,
        },
      });
      roleIds[key] = role.id;

      const permissions = await rawDb.permission.findMany({
        where: { key: { in: [...definition.permissions] } },
        select: { id: true },
      });
      await rawDb.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }

    const userIds: Record<string, string> = {};
    for (const person of params.people) {
      const user = await db.user.create({
        data: {
          organisationId: organisation.id,
          email: `${person.firstName.toLowerCase()}@${params.emailDomain}`,
          firstName: person.firstName,
          lastName: person.lastName,
          jobTitle: person.jobTitle,
        },
      });
      await rawDb.userRole.create({
        data: { userId: user.id, roleId: roleIds[person.roleKey] },
      });
      userIds[person.roleKey] = user.id;
    }

    return { organisation, roleIds, userIds };
  });
}

const NOPEDI_CUSTOMERS = [
  { name: "City of Tshwane", isPublicSector: true, city: "Pretoria" },
  { name: "eThekwini Municipality", isPublicSector: true, city: "Durban" },
  { name: "Eskom Holdings SOC Ltd", isPublicSector: true, city: "Johannesburg" },
  { name: "Transnet SOC Ltd", isPublicSector: true, city: "Johannesburg" },
  { name: "Sasol South Africa", isPublicSector: false, city: "Secunda" },
  { name: "Anglo American Platinum", isPublicSector: false, city: "Rustenburg" },
];

interface TenderSpec {
  title: string;
  customer: string;
  industry: string;
  valueRands: number;
  closingInDays: number;
  status: TenderStatus;
  /** How many mandatory checklist items are already satisfied. */
  satisfiedMandatory: number | "all";
}

const NOPEDI_TENDERS: TenderSpec[] = [
  { title: "Bulk water pipeline replacement, Ward 12", customer: "City of Tshwane", industry: "Civil engineering", valueRands: 12_400_000, closingInDays: 4, status: "IN_PROGRESS", satisfiedMandatory: 5 },
  { title: "Substation refurbishment, Kwa-Mashu", customer: "eThekwini Municipality", industry: "Electrical", valueRands: 8_750_000, closingInDays: 6, status: "IN_PROGRESS", satisfiedMandatory: 7 },
  { title: "Medupi conveyor maintenance contract", customer: "Eskom Holdings SOC Ltd", industry: "Mechanical", valueRands: 22_100_000, closingInDays: 2, status: "PENDING_APPROVAL", satisfiedMandatory: "all" },
  { title: "Rail siding civils, Richards Bay", customer: "Transnet SOC Ltd", industry: "Civil engineering", valueRands: 31_800_000, closingInDays: 11, status: "PENDING_APPROVAL", satisfiedMandatory: "all" },
  { title: "Plant electrical shutdown support", customer: "Sasol South Africa", industry: "Electrical", valueRands: 6_300_000, closingInDays: 18, status: "IN_PROGRESS", satisfiedMandatory: 3 },
  { title: "Tailings dam instrumentation", customer: "Anglo American Platinum", industry: "Instrumentation", valueRands: 4_950_000, closingInDays: 25, status: "IDENTIFIED", satisfiedMandatory: 0 },
  { title: "Stormwater upgrade, Soshanguve", customer: "City of Tshwane", industry: "Civil engineering", valueRands: 9_200_000, closingInDays: 33, status: "IDENTIFIED", satisfiedMandatory: 0 },
  { title: "Street lighting retrofit programme", customer: "eThekwini Municipality", industry: "Electrical", valueRands: 15_600_000, closingInDays: 41, status: "IDENTIFIED", satisfiedMandatory: 1 },
  { title: "Distribution network hardening", customer: "Eskom Holdings SOC Ltd", industry: "Electrical", valueRands: 27_400_000, closingInDays: 52, status: "IDENTIFIED", satisfiedMandatory: 0 },
  { title: "Port crane structural repairs", customer: "Transnet SOC Ltd", industry: "Structural", valueRands: 18_900_000, closingInDays: 60, status: "IDENTIFIED", satisfiedMandatory: 0 },
  { title: "Reservoir telemetry installation", customer: "City of Tshwane", industry: "Instrumentation", valueRands: 3_400_000, closingInDays: 74, status: "APPROVED", satisfiedMandatory: "all" },
  { title: "Boiler house pipework replacement", customer: "Sasol South Africa", industry: "Mechanical", valueRands: 11_750_000, closingInDays: 88, status: "SUBMITTED", satisfiedMandatory: "all" },
];

/** Closed tenders, so win rate and trend charts have something to show. */
const NOPEDI_HISTORY: Array<TenderSpec & { won: boolean }> = [
  { title: "Water treatment works upgrade", customer: "City of Tshwane", industry: "Civil engineering", valueRands: 14_200_000, closingInDays: -45, status: "WON", satisfiedMandatory: "all", won: true },
  { title: "MV switchgear replacement", customer: "Eskom Holdings SOC Ltd", industry: "Electrical", valueRands: 7_800_000, closingInDays: -62, status: "WON", satisfiedMandatory: "all", won: true },
  { title: "Bulk earthworks, Cornubia", customer: "eThekwini Municipality", industry: "Civil engineering", valueRands: 21_500_000, closingInDays: -80, status: "LOST", satisfiedMandatory: "all", won: false },
  { title: "Conveyor belt supply contract", customer: "Anglo American Platinum", industry: "Mechanical", valueRands: 5_600_000, closingInDays: -95, status: "LOST", satisfiedMandatory: "all", won: false },
  { title: "Pump station refurbishment", customer: "Transnet SOC Ltd", industry: "Mechanical", valueRands: 9_900_000, closingInDays: -110, status: "WON", satisfiedMandatory: "all", won: true },
  // Deliberately left without a project, so the "start a project from a won
  // tender" handoff has something to act on in a demo.
  { title: "Depot electrical upgrade", customer: "eThekwini Municipality", industry: "Electrical", valueRands: 6_700_000, closingInDays: -28, status: "WON", satisfiedMandatory: "all", won: true },
  { title: "Access road rehabilitation", customer: "City of Tshwane", industry: "Civil engineering", valueRands: 6_150_000, closingInDays: -130, status: "NO_BID", satisfiedMandatory: 2, won: false },
];

async function main() {
  console.log("Resetting…");
  await rawDb.$executeRawUnsafe("TRUNCATE organisations CASCADE");
  await rawDb.$executeRawUnsafe("TRUNCATE permissions CASCADE");
  await seedPermissionCatalogue();

  console.log("Seeding Nopedi…");
  const nopedi = await seedTenant({
    name: "Nopedi Projects",
    emailDomain: "nopedi.co.za",
    people: [
      { roleKey: "executive", firstName: "Thato", lastName: "Chokoe", jobTitle: "Managing Director" },
      { roleKey: "finance_manager", firstName: "Lerato", lastName: "Mokoena", jobTitle: "Finance Manager" },
      { roleKey: "sales_manager", firstName: "Bongani", lastName: "Sithole", jobTitle: "Sales Manager" },
      { roleKey: "project_manager", firstName: "Zanele", lastName: "Khoza", jobTitle: "Project Manager" },
      { roleKey: "tender_officer", firstName: "Sipho", lastName: "Ndlovu", jobTitle: "Tender Officer" },
      { roleKey: "employee", firstName: "Anele", lastName: "Dlamini", jobTitle: "Site Supervisor" },
      { roleKey: "hr_manager", firstName: "Refilwe", lastName: "Molefe", jobTitle: "HR Manager" },
    ],
  });

  await withSystemContext(nopedi.organisation.id, async () => {
    const customerIds = new Map<string, string>();
    for (const customer of NOPEDI_CUSTOMERS) {
      const created = await db.customer.create({
        data: {
          organisationId: nopedi.organisation.id,
          name: customer.name,
          isPublicSector: customer.isPublicSector,
          city: customer.city,
          countryCode: "ZA",
        },
      });
      customerIds.set(customer.name, created.id);
    }

    const year = new Date().getUTCFullYear();
    let counter = 0;
    const all = [...NOPEDI_TENDERS, ...NOPEDI_HISTORY];

    for (const spec of all) {
      counter += 1;
      const reference = `TN-${year}-${String(counter).padStart(4, "0")}`;
      const isClosed = ["WON", "LOST", "NO_BID", "WITHDRAWN"].includes(
        spec.status,
      );

      const tender = await db.tender.create({
        data: {
          organisationId: nopedi.organisation.id,
          reference,
          title: spec.title,
          customerId: customerIds.get(spec.customer),
          ownerId: nopedi.userIds.tender_officer,
          industry: spec.industry,
          closingAt: days(spec.closingInDays),
          estimatedValueCents: BigInt(spec.valueRands * 100),
          status: spec.status,
          submittedAt: isClosed || spec.status === "SUBMITTED" ? days(spec.closingInDays - 2) : null,
          outcomeAt: isClosed ? days(spec.closingInDays + 20) : null,
          awardedValueCents:
            spec.status === "WON" ? BigInt(spec.valueRands * 100) : null,
          outcomeNotes:
            spec.status === "LOST"
              ? "Price ranked third of five bidders."
              : spec.status === "NO_BID"
                ? "Declined — clashed with Medupi resourcing."
                : null,
        },
      });

      const satisfiedCount =
        spec.satisfiedMandatory === "all"
          ? DEFAULT_TENDER_CHECKLIST.length
          : spec.satisfiedMandatory;

      let index = 0;
      for (const item of DEFAULT_TENDER_CHECKLIST) {
        const satisfied = index < satisfiedCount;
        await db.tenderRequirement.create({
          data: {
            organisationId: nopedi.organisation.id,
            tenderId: tender.id,
            label: item.label,
            isMandatory: item.isMandatory,
            sortOrder: index,
            satisfiedAt: satisfied ? days(-3) : null,
            satisfiedBy: satisfied ? nopedi.userIds.tender_officer : null,
          },
        });
        index += 1;
      }

      await db.referenceSequence.upsert({
        where: {
          organisationId_prefix_year: {
            organisationId: nopedi.organisation.id,
            prefix: "TN",
            year,
          },
        },
        create: {
          organisationId: nopedi.organisation.id,
          prefix: "TN",
          year,
          lastNumber: counter,
        },
        update: { lastNumber: counter },
      });
    }

    // A two-step chain: finance, then the MD.
    const definition = await db.workflowDefinition.create({
      data: {
        organisationId: nopedi.organisation.id,
        name: "Tender submission approval",
        entityType: "TENDER",
        triggerEvent: "tender.submitted_for_approval",
        isActive: true,
      },
    });
    const financeStep = await db.workflowStep.create({
      data: {
        organisationId: nopedi.organisation.id,
        workflowDefinitionId: definition.id,
        sortOrder: 0,
        name: "Finance review",
        approverType: "ROLE",
        approverRoleId: nopedi.roleIds.finance_manager,
        slaHours: 48,
      },
    });
    const execStep = await db.workflowStep.create({
      data: {
        organisationId: nopedi.organisation.id,
        workflowDefinitionId: definition.id,
        sortOrder: 1,
        name: "Managing Director sign-off",
        approverType: "USER",
        approverUserId: nopedi.userIds.executive,
        slaHours: 24,
      },
    });

    // Put the two PENDING_APPROVAL tenders into a live approval chain so the
    // approvals queue has something real in it.
    const pending = await db.tender.findMany({
      where: { status: "PENDING_APPROVAL" },
    });
    for (const tender of pending) {
      const instance = await db.workflowInstance.create({
        data: {
          organisationId: nopedi.organisation.id,
          workflowDefinitionId: definition.id,
          entityType: "TENDER",
          entityId: tender.id,
          status: "PENDING",
          currentStepOrder: 0,
          startedById: nopedi.userIds.tender_officer,
        },
      });
      await db.workflowApproval.create({
        data: {
          organisationId: nopedi.organisation.id,
          workflowInstanceId: instance.id,
          workflowStepId: financeStep.id,
          sortOrder: 0,
          status: "PENDING",
          assignedToRoleId: nopedi.roleIds.finance_manager,
          dueAt: days(2),
        },
      });
      await db.workflowApproval.create({
        data: {
          organisationId: nopedi.organisation.id,
          workflowInstanceId: instance.id,
          workflowStepId: execStep.id,
          sortOrder: 1,
          status: "PENDING",
          assignedToUserId: nopedi.userIds.executive,
          dueAt: days(3),
        },
      });
    }

    // ---- CRM -------------------------------------------------------------
    // Contacts hang off the customers already created for tenders, rather than
    // a parallel set of client records. That is the point of the shared model.
    const contacts = [
      { customer: "City of Tshwane", first: "Palesa", last: "Mokwena", title: "Supply Chain Manager", primary: true },
      { customer: "City of Tshwane", first: "Riaan", last: "Botha", title: "Project Engineer", primary: false },
      { customer: "eThekwini Municipality", first: "Sanele", last: "Zulu", title: "Head of Infrastructure", primary: true },
      { customer: "Eskom Holdings SOC Ltd", first: "Karabo", last: "Nkosi", title: "Contracts Manager", primary: true },
      { customer: "Transnet SOC Ltd", first: "Yusuf", last: "Patel", title: "Procurement Lead", primary: true },
      { customer: "Sasol South Africa", first: "Marlize", last: "van Wyk", title: "Maintenance Superintendent", primary: true },
      { customer: "Anglo American Platinum", first: "Tebogo", last: "Ramaphosa", title: "Engineering Manager", primary: true },
    ];
    const contactIds = new Map<string, string>();
    for (const person of contacts) {
      const created = await db.contact.create({
        data: {
          organisationId: nopedi.organisation.id,
          customerId: customerIds.get(person.customer)!,
          firstName: person.first,
          lastName: person.last,
          jobTitle: person.title,
          email: `${person.first.toLowerCase()}@${person.customer
            .toLowerCase()
            .replace(/[^a-z]/g, "")
            .slice(0, 12)}.co.za`,
          isPrimary: person.primary,
        },
      });
      if (person.primary) contactIds.set(person.customer, created.id);
    }

    // Open deals across the three working stages, two of them tied to the
    // tenders they are being pursued through.
    const allTenders = await db.tender.findMany({
      select: { id: true, title: true },
    });
    const tenderByTitle = new Map(allTenders.map((t) => [t.title, t.id]));

    const deals: Array<{
      title: string;
      customer: string;
      valueRands: number;
      probability: number;
      stage: "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
      closeInDays: number;
      tenderTitle?: string;
      lostReason?: string;
    }> = [
      { title: "Framework agreement — bulk water", customer: "City of Tshwane", valueRands: 18_500_000, probability: 60, stage: "NEGOTIATION", closeInDays: 21, tenderTitle: "Bulk water pipeline replacement, Ward 12" },
      { title: "Conveyor maintenance, 3-year term", customer: "Eskom Holdings SOC Ltd", valueRands: 22_100_000, probability: 75, stage: "NEGOTIATION", closeInDays: 9, tenderTitle: "Medupi conveyor maintenance contract" },
      { title: "Substation upgrade programme", customer: "eThekwini Municipality", valueRands: 8_750_000, probability: 50, stage: "PROPOSAL", closeInDays: 34, tenderTitle: "Substation refurbishment, Kwa-Mashu" },
      { title: "Shutdown support panel", customer: "Sasol South Africa", valueRands: 6_300_000, probability: 50, stage: "PROPOSAL", closeInDays: 47, tenderTitle: "Plant electrical shutdown support" },
      { title: "Instrumentation supply agreement", customer: "Anglo American Platinum", valueRands: 4_950_000, probability: 25, stage: "QUALIFIED", closeInDays: 62, tenderTitle: "Tailings dam instrumentation" },
      { title: "Port infrastructure retainer", customer: "Transnet SOC Ltd", valueRands: 13_200_000, probability: 25, stage: "QUALIFIED", closeInDays: 78 },
      { title: "Reservoir telemetry rollout", customer: "City of Tshwane", valueRands: 3_400_000, probability: 100, stage: "WON", closeInDays: -18 },
      { title: "Switchgear replacement phase 2", customer: "Eskom Holdings SOC Ltd", valueRands: 7_800_000, probability: 100, stage: "WON", closeInDays: -51 },
      { title: "Cornubia earthworks package", customer: "eThekwini Municipality", valueRands: 21_500_000, probability: 0, stage: "LOST", closeInDays: -33, lostReason: "Priced third of five. Competitor had local plant already on site." },
    ];

    let oppCounter = 0;
    const opportunityIds: string[] = [];
    for (const deal of deals) {
      oppCounter += 1;
      const closed = deal.stage === "WON" || deal.stage === "LOST";
      const created = await db.opportunity.create({
        data: {
          organisationId: nopedi.organisation.id,
          reference: `OPP-${year}-${String(oppCounter).padStart(4, "0")}`,
          title: deal.title,
          customerId: customerIds.get(deal.customer)!,
          contactId: contactIds.get(deal.customer),
          ownerId: nopedi.userIds.sales_manager,
          valueCents: BigInt(deal.valueRands * 100),
          probability: deal.probability,
          expectedCloseAt: days(deal.closeInDays),
          stage: deal.stage,
          source: "EXISTING_CLIENT",
          tenderId: deal.tenderTitle ? tenderByTitle.get(deal.tenderTitle) : null,
          closedAt: closed ? days(deal.closeInDays) : null,
          lostReason: deal.lostReason,
        },
      });
      opportunityIds.push(created.id);
    }

    await db.referenceSequence.upsert({
      where: {
        organisationId_prefix_year: {
          organisationId: nopedi.organisation.id,
          prefix: "OPP",
          year,
        },
      },
      create: {
        organisationId: nopedi.organisation.id,
        prefix: "OPP",
        year,
        lastNumber: oppCounter,
      },
      update: { lastNumber: oppCounter },
    });

    // Unworked and qualified leads, so the convert flow has something to act on.
    const leads: Array<{
      company: string;
      contact: string;
      source: "REFERRAL" | "WEBSITE" | "TENDER_PORTAL" | "COLD_OUTREACH" | "EVENT";
      valueRands: number;
      status: "NEW" | "CONTACTED" | "QUALIFIED";
      description: string;
    }> = [
      { company: "Rand Water", contact: "Nomsa Dube", source: "REFERRAL", valueRands: 9_600_000, status: "QUALIFIED", description: "Pump station refurbishment across three sites. Referred by the Tshwane team." },
      { company: "Johannesburg Roads Agency", contact: "Pieter Steyn", source: "TENDER_PORTAL", valueRands: 5_200_000, status: "NEW", description: "Stormwater culvert rehabilitation. Saw the CIDB grading on eTenders." },
      { company: "Gautrain Management Agency", contact: "Ayanda Khumalo", source: "EVENT", valueRands: 14_000_000, status: "CONTACTED", description: "Met at the rail infrastructure indaba. Depot electrical upgrade planned for next year." },
      { company: "Impala Platinum", contact: "Dirk Lombard", source: "COLD_OUTREACH", valueRands: 7_400_000, status: "NEW", description: "Enquiry about conveyor instrumentation after the Anglo work." },
      { company: "Umgeni Water", contact: "Thandi Mthembu", source: "WEBSITE", valueRands: 3_100_000, status: "CONTACTED", description: "Website enquiry about telemetry installation." },
    ];

    let leadCounter = 0;
    const leadIds: string[] = [];
    for (const item of leads) {
      leadCounter += 1;
      const created = await db.lead.create({
        data: {
          organisationId: nopedi.organisation.id,
          reference: `LD-${year}-${String(leadCounter).padStart(4, "0")}`,
          companyName: item.company,
          contactName: item.contact,
          email: `${item.contact.split(" ")[0].toLowerCase()}@example.co.za`,
          source: item.source,
          status: item.status,
          description: item.description,
          estimatedValueCents: BigInt(item.valueRands * 100),
          ownerId: nopedi.userIds.sales_manager,
        },
      });
      leadIds.push(created.id);
    }

    await db.referenceSequence.upsert({
      where: {
        organisationId_prefix_year: {
          organisationId: nopedi.organisation.id,
          prefix: "LD",
          year,
        },
      },
      create: {
        organisationId: nopedi.organisation.id,
        prefix: "LD",
        year,
        lastNumber: leadCounter,
      },
      update: { lastNumber: leadCounter },
    });

    // Timelines, so the activity panels are not empty on first look.
    const activities: Array<{
      entityType: "OPPORTUNITY" | "LEAD" | "CUSTOMER";
      index: number;
      type: "CALL" | "EMAIL" | "MEETING" | "SITE_VISIT" | "NOTE";
      subject: string;
      daysAgo: number;
    }> = [
      { entityType: "OPPORTUNITY", index: 0, type: "MEETING", subject: "Scope workshop with supply chain", daysAgo: 12 },
      { entityType: "OPPORTUNITY", index: 0, type: "EMAIL", subject: "Sent revised rates schedule", daysAgo: 5 },
      { entityType: "OPPORTUNITY", index: 1, type: "CALL", subject: "Clarified availability guarantees", daysAgo: 8 },
      { entityType: "OPPORTUNITY", index: 1, type: "SITE_VISIT", subject: "Walked the conveyor route at Medupi", daysAgo: 3 },
      { entityType: "OPPORTUNITY", index: 2, type: "EMAIL", subject: "Proposal submitted", daysAgo: 6 },
      { entityType: "LEAD", index: 0, type: "CALL", subject: "Introductory call — confirmed budget exists", daysAgo: 4 },
      { entityType: "LEAD", index: 2, type: "MEETING", subject: "Coffee at the indaba", daysAgo: 15 },
    ];

    for (const item of activities) {
      const entityId =
        item.entityType === "OPPORTUNITY"
          ? opportunityIds[item.index]
          : leadIds[item.index];
      if (!entityId) continue;
      await db.activity.create({
        data: {
          organisationId: nopedi.organisation.id,
          entityType: item.entityType,
          entityId,
          type: item.type,
          subject: item.subject,
          occurredAt: days(-item.daysAgo),
          ownerId: nopedi.userIds.sales_manager,
        },
      });
    }

    // ---- Projects ----------------------------------------------------------
    // Two of these come from won tenders, so the thread from bid to delivery is
    // visible rather than asserted. One is deliberately over budget.
    const wonTenders = await db.tender.findMany({
      where: { status: "WON" },
      select: { id: true, title: true, customerId: true, awardedValueCents: true },
    });

    const projectSpecs: Array<{
      name: string;
      customer: string;
      fromTenderTitle?: string;
      contractRands: number;
      budgetRands: number;
      status: "PLANNING" | "ACTIVE" | "ON_HOLD";
      startInDays: number;
      endInDays: number;
      percentComplete: number;
      /** Approved spend, which is what counts against the budget. */
      spend: Array<{ description: string; category: "LABOUR" | "MATERIALS" | "PLANT" | "SUBCONTRACTOR" | "TRANSPORT"; rands: number; status: "APPROVED" | "PAID" | "SUBMITTED" }>;
      tasks: Array<{ title: string; status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE"; dueInDays: number; blockedReason?: string }>;
    }> = [
      {
        name: "Water treatment works upgrade",
        customer: "City of Tshwane",
        fromTenderTitle: "Water treatment works upgrade",
        contractRands: 14_200_000,
        budgetRands: 11_400_000,
        status: "ACTIVE",
        startInDays: -40,
        endInDays: 95,
        percentComplete: 45,
        spend: [
          { description: "Filtration media supply", category: "MATERIALS", rands: 2_850_000, status: "PAID" },
          { description: "Civils subcontract, phase 1", category: "SUBCONTRACTOR", rands: 1_900_000, status: "PAID" },
          { description: "Site team, months 1–2", category: "LABOUR", rands: 980_000, status: "APPROVED" },
          { description: "Crane hire", category: "PLANT", rands: 320_000, status: "SUBMITTED" },
        ],
        tasks: [
          { title: "Site establishment", status: "DONE", dueInDays: -35 },
          { title: "Demolish existing filter beds", status: "DONE", dueInDays: -14 },
          { title: "Install filtration media", status: "IN_PROGRESS", dueInDays: 12 },
          { title: "Commission control system", status: "TODO", dueInDays: 60 },
          { title: "As-built drawings", status: "TODO", dueInDays: 88 },
        ],
      },
      {
        name: "MV switchgear replacement",
        customer: "Eskom Holdings SOC Ltd",
        fromTenderTitle: "MV switchgear replacement",
        contractRands: 7_800_000,
        budgetRands: 6_100_000,
        status: "ACTIVE",
        startInDays: -58,
        endInDays: -4,
        percentComplete: 90,
        spend: [
          { description: "Switchgear panels", category: "MATERIALS", rands: 4_200_000, status: "PAID" },
          { description: "Specialist commissioning", category: "SUBCONTRACTOR", rands: 1_450_000, status: "PAID" },
          { description: "Extended outage standby crew", category: "LABOUR", rands: 890_000, status: "APPROVED" },
        ],
        tasks: [
          { title: "Factory acceptance test", status: "DONE", dueInDays: -40 },
          { title: "Outage window 1", status: "DONE", dueInDays: -22 },
          { title: "Protection settings sign-off", status: "BLOCKED", dueInDays: -6, blockedReason: "Awaiting client's protection engineer to countersign." },
          { title: "Handover pack", status: "TODO", dueInDays: 5 },
        ],
      },
      {
        name: "Pump station refurbishment",
        customer: "Transnet SOC Ltd",
        fromTenderTitle: "Pump station refurbishment",
        contractRands: 9_900_000,
        budgetRands: 7_900_000,
        status: "PLANNING",
        startInDays: 14,
        endInDays: 160,
        percentComplete: 5,
        spend: [
          { description: "Advance order — pump units", category: "MATERIALS", rands: 1_100_000, status: "APPROVED" },
        ],
        tasks: [
          { title: "Confirm long-lead items", status: "IN_PROGRESS", dueInDays: 9 },
          { title: "Mobilisation plan", status: "TODO", dueInDays: 20 },
        ],
      },
    ];

    let projectCounter = 0;
    let expenseCounter = 0;

    for (const spec of projectSpecs) {
      projectCounter += 1;
      const tender = spec.fromTenderTitle
        ? wonTenders.find((t) => t.title === spec.fromTenderTitle)
        : undefined;

      const project = await db.project.create({
        data: {
          organisationId: nopedi.organisation.id,
          reference: `PRJ-${year}-${String(projectCounter).padStart(4, "0")}`,
          name: spec.name,
          customerId: customerIds.get(spec.customer)!,
          tenderId: tender?.id,
          managerId: nopedi.userIds.project_manager,
          contractValueCents: BigInt(spec.contractRands * 100),
          budgetCents: BigInt(spec.budgetRands * 100),
          status: spec.status,
          startsAt: days(spec.startInDays),
          endsAt: days(spec.endInDays),
          percentComplete: spec.percentComplete,
        },
      });

      for (const person of [
        { key: "project_manager", role: "MANAGER" as const, allocation: 60 },
        { key: "employee", role: "SUPERVISOR" as const, allocation: 100 },
      ]) {
        await db.projectMember.create({
          data: {
            organisationId: nopedi.organisation.id,
            projectId: project.id,
            userId: nopedi.userIds[person.key],
            role: person.role,
            allocation: person.allocation,
          },
        });
      }

      for (const [index, task] of spec.tasks.entries()) {
        await db.projectTask.create({
          data: {
            organisationId: nopedi.organisation.id,
            projectId: project.id,
            title: task.title,
            status: task.status,
            dueAt: days(task.dueInDays),
            completedAt: task.status === "DONE" ? days(task.dueInDays) : null,
            blockedReason: task.blockedReason,
            assigneeId:
              index % 2 === 0
                ? nopedi.userIds.employee
                : nopedi.userIds.project_manager,
            sortOrder: index,
          },
        });
      }

      for (const cost of spec.spend) {
        expenseCounter += 1;
        const decided = cost.status !== "SUBMITTED";
        await db.projectExpense.create({
          data: {
            organisationId: nopedi.organisation.id,
            projectId: project.id,
            reference: `EXP-${year}-${String(expenseCounter).padStart(4, "0")}`,
            description: cost.description,
            category: cost.category,
            amountCents: BigInt(cost.rands * 100),
            status: cost.status,
            incurredAt: days(-Math.floor(Math.random() * 40) - 2),
            submittedById: nopedi.userIds.employee,
            approvedById: decided ? nopedi.userIds.project_manager : null,
            approvedAt: decided ? days(-3) : null,
          },
        });
      }

      await db.projectMilestone.create({
        data: {
          organisationId: nopedi.organisation.id,
          projectId: project.id,
          name: "Practical completion",
          dueAt: days(spec.endInDays),
          isPaymentMilestone: true,
          valueCents: BigInt(Math.round(spec.contractRands * 0.3) * 100),
          sortOrder: 0,
        },
      });
    }

    for (const [prefix, count] of [
      ["PRJ", projectCounter],
      ["EXP", expenseCounter],
    ] as const) {
      await db.referenceSequence.upsert({
        where: {
          organisationId_prefix_year: {
            organisationId: nopedi.organisation.id,
            prefix,
            year,
          },
        },
        create: {
          organisationId: nopedi.organisation.id,
          prefix,
          year,
          lastNumber: count,
        },
        update: { lastNumber: count },
      });
    }

    // Expiring company compliance, which the dashboard surfaces and which the
    // same engine will later drive for HR and HSE (ADR-004).
    const compliance = [
      { name: "Tax clearance / compliance status PIN", days: 21 },
      { name: "B-BBEE verification certificate", days: 64 },
      { name: "Letter of good standing (COIDA)", days: -5 },
      { name: "Public liability insurance", days: 140 },
      { name: "CIDB registration (6CE)", days: 83 },
    ];
    for (const item of compliance) {
      await db.complianceItem.create({
        data: {
          organisationId: nopedi.organisation.id,
          category: "ACCREDITATION",
          entityType: "ORGANISATION",
          entityId: nopedi.organisation.id,
          requirementName: item.name,
          issuedAt: days(item.days - 365),
          expiresAt: days(item.days),
          providerName: "SARS / SANAS",
        },
      });
    }

    // ---- HR ----------------------------------------------------------------
    // Leave entitlements here are the BCEA statutory minimums, which is what
    // the law guarantees rather than what Nopedi necessarily grants. A
    // bargaining council agreement or their own policy may be more generous,
    // and finding out which is an open discovery question. They are seeded as
    // rows precisely so correcting them is a data change.
    const leaveTypes: Record<string, string> = {};
    for (const type of [
      {
        code: "ANNUAL",
        name: "Annual leave",
        description: "BCEA minimum is 21 consecutive days, which is 15 working days.",
        daysPerCycle: 15,
        carryOverMaxDays: 5,
        sortOrder: 1,
      },
      {
        code: "SICK",
        name: "Sick leave",
        description:
          "BCEA allows 30 days over a 36-month cycle. Seeded as the annual share.",
        daysPerCycle: 10,
        documentRequiredAfterDays: 2,
        allowsBackdating: true,
        sortOrder: 2,
      },
      {
        code: "FAMILY",
        name: "Family responsibility",
        description: "BCEA minimum is 3 days a year.",
        daysPerCycle: 3,
        allowsBackdating: true,
        sortOrder: 3,
      },
      {
        code: "UNPAID",
        name: "Unpaid leave",
        description: "Uncapped, and approved case by case.",
        daysPerCycle: null,
        isPaid: false,
        sortOrder: 4,
      },
    ]) {
      const created = await db.leaveType.create({
        data: {
          organisationId: nopedi.organisation.id,
          code: type.code,
          name: type.name,
          description: type.description,
          daysPerCycle: type.daysPerCycle,
          isPaid: type.isPaid ?? true,
          carryOverMaxDays: type.carryOverMaxDays ?? null,
          documentRequiredAfterDays: type.documentRequiredAfterDays ?? null,
          allowsBackdating: type.allowsBackdating ?? false,
          sortOrder: type.sortOrder,
        },
      });
      leaveTypes[type.code] = created.id;
    }

    // Everyone with a login is also on the payroll, plus site staff who have
    // no reason to ever sign in — which is the case the Employee/User split
    // exists for.
    const employeeSpecs: Array<{
      firstName: string;
      lastName: string;
      jobTitle: string;
      department: string;
      roleKey?: keyof typeof SYSTEM_ROLES;
      employmentType?: "PERMANENT" | "FIXED_TERM" | "TEMPORARY" | "CONTRACTOR" | "APPRENTICE";
      startedDaysAgo: number;
      /** Certifications, with how many days from now they expire. */
      certifications?: Array<{ name: string; category: "TRAINING" | "MEDICAL" | "HSE" | "LICENCE"; expiresInDays: number }>;
    }> = [
      { firstName: "Thato", lastName: "Chokoe", jobTitle: "Managing Director", department: "Executive", roleKey: "executive", startedDaysAgo: 2900 },
      { firstName: "Refilwe", lastName: "Molefe", jobTitle: "HR Manager", department: "Corporate services", roleKey: "hr_manager", startedDaysAgo: 1100 },
      { firstName: "Lerato", lastName: "Mokoena", jobTitle: "Finance Manager", department: "Finance", roleKey: "finance_manager", startedDaysAgo: 1500 },
      { firstName: "Zanele", lastName: "Khoza", jobTitle: "Project Manager", department: "Delivery", roleKey: "project_manager", startedDaysAgo: 980,
        certifications: [
          { name: "First aid level 2", category: "TRAINING", expiresInDays: 40 },
          { name: "Construction Regulations 8(1) appointment", category: "HSE", expiresInDays: 400 },
        ] },
      { firstName: "Sipho", lastName: "Ndlovu", jobTitle: "Tender Officer", department: "Commercial", roleKey: "tender_officer", startedDaysAgo: 700 },
      { firstName: "Bongani", lastName: "Sithole", jobTitle: "Sales Manager", department: "Commercial", roleKey: "sales_manager", startedDaysAgo: 640 },
      { firstName: "Anele", lastName: "Dlamini", jobTitle: "Site Supervisor", department: "Delivery", roleKey: "employee", startedDaysAgo: 420,
        certifications: [
          { name: "Working at heights", category: "TRAINING", expiresInDays: -12 },
          { name: "Medical certificate of fitness", category: "MEDICAL", expiresInDays: 25 },
        ] },
      // No login: the people the split exists for.
      { firstName: "Jacob", lastName: "Mthembu", jobTitle: "Boilermaker", department: "Workshop", startedDaysAgo: 1600,
        certifications: [
          { name: "Trade test certificate", category: "TRAINING", expiresInDays: 3600 },
          { name: "Welding coded qualification", category: "TRAINING", expiresInDays: 70 },
        ] },
      { firstName: "Pieter", lastName: "van Wyk", jobTitle: "Plant Operator", department: "Plant", startedDaysAgo: 300, employmentType: "FIXED_TERM",
        certifications: [
          { name: "Forklift licence", category: "LICENCE", expiresInDays: -3 },
          { name: "Medical certificate of fitness", category: "MEDICAL", expiresInDays: 150 },
        ] },
      { firstName: "Nomsa", lastName: "Zulu", jobTitle: "Site Clerk", department: "Delivery", startedDaysAgo: 210, employmentType: "TEMPORARY" },
      { firstName: "Katlego", lastName: "Sebego", jobTitle: "Apprentice Electrician", department: "Workshop", startedDaysAgo: 120, employmentType: "APPRENTICE",
        certifications: [{ name: "Induction — site safety", category: "HSE", expiresInDays: 200 }] },
    ];

    const cycleStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const cycleEnd = new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31));
    const employeeIds: Record<string, string> = {};
    let employeeCounter = 0;

    for (const spec of employeeSpecs) {
      employeeCounter += 1;
      const employee = await db.employee.create({
        data: {
          organisationId: nopedi.organisation.id,
          employeeNumber: `EMP-${year}-${String(employeeCounter).padStart(4, "0")}`,
          userId: spec.roleKey ? nopedi.userIds[spec.roleKey] : null,
          firstName: spec.firstName,
          lastName: spec.lastName,
          email: spec.roleKey
            ? `${spec.firstName.toLowerCase()}@nopedi.co.za`
            : null,
          jobTitle: spec.jobTitle,
          department: spec.department,
          employmentType: spec.employmentType ?? "PERMANENT",
          startedAt: days(-spec.startedDaysAgo),
        },
      });
      employeeIds[`${spec.firstName} ${spec.lastName}`] = employee.id;

      // Annual and sick balances for the current cycle, part-used.
      for (const [code, entitled, taken] of [
        ["ANNUAL", 15, employeeCounter % 4 === 0 ? 9 : employeeCounter % 3],
        ["SICK", 10, employeeCounter % 5 === 0 ? 4 : 0],
        ["FAMILY", 3, 0],
      ] as Array<[string, number, number]>) {
        await db.leaveBalance.create({
          data: {
            organisationId: nopedi.organisation.id,
            employeeId: employee.id,
            leaveTypeId: leaveTypes[code],
            cycleStartsAt: cycleStart,
            cycleEndsAt: cycleEnd,
            entitledDays: entitled,
            takenDays: taken,
          },
        });
      }

      for (const cert of spec.certifications ?? []) {
        await db.complianceItem.create({
          data: {
            organisationId: nopedi.organisation.id,
            category: cert.category,
            entityType: "EMPLOYEE",
            entityId: employee.id,
            requirementName: cert.name,
            issuedAt: days(cert.expiresInDays - 730),
            expiresAt: days(cert.expiresInDays),
          },
        });
      }
    }

    // Two live requests so the approvals queue is not empty, and one already
    // decided so the history has something in it.
    // The day counts are stated rather than derived: the seed writes rows
    // directly, and a count that disagrees with its own date range is exactly
    // the inconsistency the register exists to surface.
    const pendingLeave: Array<[string, string, number, number, number, string]> = [
      ["Anele Dlamini", "ANNUAL", 12, 16, 3, "Family function in Polokwane."],
      ["Jacob Mthembu", "SICK", -2, -1, 2, "Flu. Medical certificate to follow."],
    ];
    let leaveCounter = 0;
    for (const [who, code, startIn, endIn, dayCount, reason] of pendingLeave) {
      leaveCounter += 1;
      await db.leaveRequest.create({
        data: {
          organisationId: nopedi.organisation.id,
          reference: `LV-${year}-${String(leaveCounter).padStart(4, "0")}`,
          employeeId: employeeIds[who],
          leaveTypeId: leaveTypes[code],
          startsAt: days(startIn),
          endsAt: days(endIn),
          days: dayCount,
          reason,
        },
      });
    }

    leaveCounter += 1;
    await db.leaveRequest.create({
      data: {
        organisationId: nopedi.organisation.id,
        reference: `LV-${year}-${String(leaveCounter).padStart(4, "0")}`,
        employeeId: employeeIds["Zanele Khoza"],
        leaveTypeId: leaveTypes.ANNUAL,
        startsAt: days(-40),
        endsAt: days(-36),
        days: 5,
        status: "APPROVED",
        decidedById: nopedi.userIds.hr_manager,
        decidedAt: days(-48),
      },
    });
  });

  console.log("Seeding a second tenant, to prove isolation…");
  const rival = await seedTenant({
    name: "Kgosi Civils",
    emailDomain: "kgosicivils.co.za",
    people: [
      { roleKey: "executive", firstName: "Naledi", lastName: "Mahlangu", jobTitle: "Director" },
      { roleKey: "tender_officer", firstName: "Johan", lastName: "Pretorius", jobTitle: "Bid Manager" },
      { roleKey: "sales_manager", firstName: "Marius", lastName: "Venter", jobTitle: "Sales Lead" },
    ],
  });

  await withSystemContext(rival.organisation.id, async () => {
    const customer = await db.customer.create({
      data: {
        organisationId: rival.organisation.id,
        name: "Rand Water",
        isPublicSector: true,
        city: "Johannesburg",
      },
    });
    await db.tender.create({
      data: {
        organisationId: rival.organisation.id,
        reference: "TN-2026-0001",
        title: "Kgosi Civils — pipeline contract (must never appear for Nopedi)",
        customerId: customer.id,
        ownerId: rival.userIds.tender_officer,
        industry: "Civil engineering",
        closingAt: days(9),
        estimatedValueCents: BigInt(5_000_000_00),
        status: "IN_PROGRESS",
      },
    });
  });

  const counts = {
    organisations: await rawDb.organisation.count(),
    users: await rawDb.user.count(),
    tenders: await rawDb.tender.count(),
    approvals: await rawDb.workflowApproval.count(),
    customers: await rawDb.customer.count(),
    leads: await rawDb.lead.count(),
    opportunities: await rawDb.opportunity.count(),
    projects: await rawDb.project.count(),
    tasks: await rawDb.projectTask.count(),
    expenses: await rawDb.projectExpense.count(),
  };
  console.log("Done:", counts);

}

main()
  .then(() => rawDb.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await rawDb.$disconnect();
    process.exit(1);
  });
