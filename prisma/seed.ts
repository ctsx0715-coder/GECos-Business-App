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
            MODULES.DOCUMENTS,
            MODULES.REPORTS,
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
      { roleKey: "tender_officer", firstName: "Sipho", lastName: "Ndlovu", jobTitle: "Tender Officer" },
      { roleKey: "employee", firstName: "Anele", lastName: "Dlamini", jobTitle: "Site Supervisor" },
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
  });

  console.log("Seeding a second tenant, to prove isolation…");
  const rival = await seedTenant({
    name: "Kgosi Civils",
    emailDomain: "kgosicivils.co.za",
    people: [
      { roleKey: "executive", firstName: "Naledi", lastName: "Mahlangu", jobTitle: "Director" },
      { roleKey: "tender_officer", firstName: "Johan", lastName: "Pretorius", jobTitle: "Bid Manager" },
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
  };
  console.log("Done:", counts);
  console.log("\nSign in as any of these at http://localhost:3000");
}

main()
  .then(() => rawDb.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await rawDb.$disconnect();
    process.exit(1);
  });
