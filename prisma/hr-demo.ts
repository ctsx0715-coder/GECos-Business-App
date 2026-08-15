import { db } from "@/lib/database/client";
import { nextReference } from "@/lib/database/reference-numbers";
import { statutoryHolidays } from "@/modules/hr/public-holidays";
import type { ComplianceCategory, EmploymentType, LeaveAccrualMethod } from "@/generated/prisma/client";

/**
 * The HR demonstration dataset, and the one function that writes it.
 *
 * Two callers need this and they are not alike. `prisma/seed.ts` builds a
 * database from nothing and may assume every table is empty. The backfill
 * script runs against a database that has been live for weeks, was seeded
 * before HR existed, and already has tenders and projects in it that nobody
 * wants truncated to gain a leave register.
 *
 * Writing the dataset twice would mean two versions of Nopedi's staff drifting
 * apart, so it is written once, here, and everything is idempotent: each step
 * asks what already exists and adds only what is missing. That makes the seed
 * path no worse — on an empty database nothing exists, so everything is added
 * — and makes the backfill safe to run twice.
 *
 * The entitlements are the BCEA statutory minimums: what the law guarantees,
 * not necessarily what Nopedi grants. Which bargaining council agreement or
 * company policy sits above them is an open question
 * (docs/02-discovery-questions.md), and these are rows precisely so that
 * answer is a data change.
 */

export interface LeaveTypeSpec {
  code: string;
  name: string;
  description: string;
  daysPerCycle: number | null;
  isPaid?: boolean;
  carryOverMaxDays?: number;
  documentRequiredAfterDays?: number;
  allowsBackdating?: boolean;
  accrualMethod: LeaveAccrualMethod;
  accrualDaysPerPeriod?: number;
  sortOrder: number;
}

export const LEAVE_TYPES: LeaveTypeSpec[] = [
  {
    code: "ANNUAL",
    name: "Annual leave",
    description:
      "BCEA minimum is 21 consecutive days, which is 15 working days. Earned at 1.25 days a month, so somebody who joins in July has earned half a year of it by December.",
    daysPerCycle: 15,
    carryOverMaxDays: 5,
    accrualMethod: "MONTHLY_ACCRUAL",
    accrualDaysPerPeriod: 1.25,
    sortOrder: 1,
  },
  {
    code: "SICK",
    name: "Sick leave",
    description:
      "The BCEA cycle is 30 days over 36 months. Granted here as the annual share, in full at the start of the cycle, because sick leave is not something anybody should have to accrue before they are allowed to be ill.",
    daysPerCycle: 10,
    documentRequiredAfterDays: 2,
    allowsBackdating: true,
    accrualMethod: "ANNUAL_GRANT",
    sortOrder: 2,
  },
  {
    code: "FAMILY",
    name: "Family responsibility",
    description:
      "BCEA minimum is 3 days a year, for the birth or illness of a child and a death in the immediate family.",
    daysPerCycle: 3,
    allowsBackdating: true,
    accrualMethod: "ANNUAL_GRANT",
    sortOrder: 3,
  },
  {
    code: "MATERNITY",
    name: "Maternity leave",
    description:
      "Four consecutive months under the BCEA, unpaid by the employer — a claim is made against the UIF. Booked as a block rather than accrued, so it is uncapped here and approved case by case.",
    daysPerCycle: null,
    isPaid: false,
    allowsBackdating: true,
    accrualMethod: "MANUAL",
    sortOrder: 4,
  },
  {
    code: "PARENTAL",
    name: "Parental leave",
    description:
      "Ten consecutive days for a parent who is not taking maternity leave, unpaid by the employer and claimable from the UIF. Granted when a child arrives rather than accrued: it belongs to the event, not to the year, so HR adds the days to the person concerned.",
    daysPerCycle: 10,
    isPaid: false,
    allowsBackdating: true,
    accrualMethod: "MANUAL",
    sortOrder: 5,
  },
  {
    code: "STUDY",
    name: "Study leave",
    description:
      "Company policy rather than statute: days for exams and trade tests, granted by agreement with the manager.",
    daysPerCycle: 5,
    accrualMethod: "ANNUAL_GRANT",
    sortOrder: 6,
  },
  {
    code: "UNPAID",
    name: "Unpaid leave",
    description: "Uncapped, and approved case by case.",
    daysPerCycle: null,
    isPaid: false,
    accrualMethod: "MANUAL",
    sortOrder: 7,
  },
];

export interface CertificationSpec {
  name: string;
  category: ComplianceCategory;
  /** Negative means it has already lapsed, which the register should show. */
  expiresInDays: number | null;
  providerName?: string;
}

export interface EmployeeSpec {
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  /** The system role whose user this employee is, when they have a login. */
  roleKey?: string;
  employmentType?: EmploymentType;
  startedDaysAgo: number;
  certifications?: CertificationSpec[];
}

/**
 * Nopedi's people.
 *
 * Everyone with a login is on the payroll, and four people are on the payroll
 * with no login at all — a boilermaker, a plant operator, a site clerk and an
 * apprentice. Those four are the reason the employee and user records are
 * separate, and a demonstration without them makes the split look like
 * over-engineering.
 */
export const EMPLOYEES: EmployeeSpec[] = [
  {
    firstName: "Thato",
    lastName: "Chokoe",
    jobTitle: "Managing Director",
    department: "Executive",
    roleKey: "executive",
    startedDaysAgo: 2900,
  },
  {
    firstName: "Refilwe",
    lastName: "Molefe",
    jobTitle: "HR Manager",
    department: "Corporate services",
    roleKey: "hr_manager",
    startedDaysAgo: 1100,
    certifications: [
      {
        name: "SABPP professional registration",
        category: "ACCREDITATION",
        expiresInDays: 300,
        providerName: "SABPP",
      },
    ],
  },
  {
    firstName: "Lerato",
    lastName: "Mokoena",
    jobTitle: "Finance Manager",
    department: "Finance",
    roleKey: "finance_manager",
    startedDaysAgo: 1500,
  },
  {
    firstName: "Zanele",
    lastName: "Khoza",
    jobTitle: "Project Manager",
    department: "Delivery",
    roleKey: "project_manager",
    startedDaysAgo: 980,
    certifications: [
      { name: "First aid level 2", category: "TRAINING", expiresInDays: 40 },
      {
        name: "Construction Regulations 8(1) appointment",
        category: "HSE",
        expiresInDays: 400,
      },
    ],
  },
  {
    firstName: "Sipho",
    lastName: "Ndlovu",
    jobTitle: "Tender Officer",
    department: "Commercial",
    roleKey: "tender_officer",
    startedDaysAgo: 700,
  },
  {
    firstName: "Bongani",
    lastName: "Sithole",
    jobTitle: "Sales Manager",
    department: "Commercial",
    roleKey: "sales_manager",
    startedDaysAgo: 640,
  },
  {
    firstName: "Anele",
    lastName: "Dlamini",
    jobTitle: "Site Supervisor",
    department: "Delivery",
    roleKey: "employee",
    startedDaysAgo: 420,
    certifications: [
      { name: "Working at heights", category: "TRAINING", expiresInDays: -12 },
      {
        name: "Medical certificate of fitness",
        category: "MEDICAL",
        expiresInDays: 25,
      },
    ],
  },
  {
    firstName: "Jacob",
    lastName: "Mthembu",
    jobTitle: "Boilermaker",
    department: "Workshop",
    startedDaysAgo: 1600,
    certifications: [
      {
        name: "Trade test certificate",
        category: "TRAINING",
        // Never expires. The register has to hold this without pretending it
        // is overdue, which is why the column is nullable.
        expiresInDays: null,
      },
      {
        name: "Welding coded qualification",
        category: "TRAINING",
        expiresInDays: 70,
      },
    ],
  },
  {
    firstName: "Pieter",
    lastName: "van Wyk",
    jobTitle: "Plant Operator",
    department: "Plant",
    employmentType: "FIXED_TERM",
    startedDaysAgo: 300,
    certifications: [
      { name: "Forklift licence", category: "LICENCE", expiresInDays: -3 },
      {
        name: "Medical certificate of fitness",
        category: "MEDICAL",
        expiresInDays: 150,
      },
    ],
  },
  {
    firstName: "Nomsa",
    lastName: "Zulu",
    jobTitle: "Site Clerk",
    department: "Delivery",
    employmentType: "TEMPORARY",
    startedDaysAgo: 210,
  },
  {
    firstName: "Katlego",
    lastName: "Sebego",
    jobTitle: "Apprentice Electrician",
    department: "Workshop",
    employmentType: "APPRENTICE",
    startedDaysAgo: 120,
    certifications: [
      { name: "Induction — site safety", category: "HSE", expiresInDays: 200 },
    ],
  },
];

/**
 * Leave with a decision behind it, so the queue and the history are not empty.
 *
 * The day counts are stated rather than derived: these rows are written
 * directly, and a count that disagrees with its own date range is exactly the
 * inconsistency the register exists to surface.
 */
interface LeaveRequestSpec {
  who: string;
  code: string;
  startsInDays: number;
  endsInDays: number;
  days: number;
  reason?: string;
  approved?: boolean;
}

export const LEAVE_REQUESTS: LeaveRequestSpec[] = [
  {
    who: "Anele Dlamini",
    code: "ANNUAL",
    startsInDays: 12,
    endsInDays: 16,
    days: 3,
    reason: "Family function in Polokwane.",
  },
  {
    who: "Jacob Mthembu",
    code: "SICK",
    startsInDays: -2,
    endsInDays: -1,
    days: 2,
    reason: "Flu. Medical certificate to follow.",
  },
  {
    who: "Zanele Khoza",
    code: "ANNUAL",
    startsInDays: -40,
    endsInDays: -36,
    days: 5,
    approved: true,
  },
];

function days(offset: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

export interface HrDemoSummary {
  leaveTypes: number;
  publicHolidays: number;
  employees: number;
  certifications: number;
  balances: number;
  leaveRequests: number;
}

/**
 * The builders' shutdown.
 *
 * Not statutory, and the reason public holidays are rows rather than a
 * calculation: construction closes between Christmas and New Year by
 * agreement, and no algorithm knows that. Seeded so the demonstration shows a
 * company day alongside the generated ones.
 */
const SHUTDOWN_DAYS: Array<[number, number, string]> = [
  [12, 29, "Builders' shutdown"],
  [12, 30, "Builders' shutdown"],
  [12, 31, "Builders' shutdown"],
];

/**
 * Write the dataset into whichever tenant the caller has bound.
 *
 * Requires a request or system context — everything below goes through the
 * extended client, so the tenant column, soft delete and the audit trail all
 * apply exactly as they would to a person doing this through the screens.
 *
 * @param userIds  Logins by role key, for the people who have one. Employees
 *                 whose role is missing from this map are still created; they
 *                 simply have no login, which is true of most site staff.
 */
export async function seedHrDemo(params: {
  organisationId: string;
  userIds: Record<string, string>;
  /** Who decided the already-approved leave. */
  decidedById?: string;
}): Promise<HrDemoSummary> {
  const { organisationId, userIds } = params;
  const summary: HrDemoSummary = {
    leaveTypes: 0,
    publicHolidays: 0,
    employees: 0,
    certifications: 0,
    balances: 0,
    leaveRequests: 0,
  };

  // ---- Leave types --------------------------------------------------------
  const leaveTypeIds: Record<string, string> = {};
  for (const spec of LEAVE_TYPES) {
    const existing = await db.leaveType.findFirst({ where: { code: spec.code } });
    if (existing) {
      leaveTypeIds[spec.code] = existing.id;
      continue;
    }

    const created = await db.leaveType.create({
      data: {
        organisationId,
        code: spec.code,
        name: spec.name,
        description: spec.description,
        daysPerCycle: spec.daysPerCycle,
        isPaid: spec.isPaid ?? true,
        carryOverMaxDays: spec.carryOverMaxDays ?? null,
        documentRequiredAfterDays: spec.documentRequiredAfterDays ?? null,
        allowsBackdating: spec.allowsBackdating ?? false,
        accrualMethod: spec.accrualMethod,
        accrualDaysPerPeriod: spec.accrualDaysPerPeriod ?? null,
        sortOrder: spec.sortOrder,
      },
    });
    leaveTypeIds[spec.code] = created.id;
    summary.leaveTypes += 1;
  }

  // ---- Public holidays ----------------------------------------------------
  // This year and next, because leave is booked across the boundary and a
  // January request should not be counted as though January had no holidays.
  const thisYear = new Date().getUTCFullYear();
  for (const year of [thisYear, thisYear + 1]) {
    const holidays = [
      ...statutoryHolidays(year).map((holiday) => ({ ...holiday, isStatutory: true })),
      ...SHUTDOWN_DAYS.map(([month, day, name]) => ({
        observedOn: new Date(Date.UTC(year, month - 1, day)),
        name,
        isStatutory: false,
      })),
    ];

    for (const holiday of holidays) {
      const already = await db.publicHoliday.findFirst({
        where: { observedOn: holiday.observedOn },
      });
      if (already) continue;

      await db.publicHoliday.create({
        data: {
          organisationId,
          observedOn: holiday.observedOn,
          name: holiday.name,
          isStatutory: holiday.isStatutory,
        },
      });
      summary.publicHolidays += 1;
    }
  }

  // ---- People -------------------------------------------------------------
  const cycleStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const cycleEnd = new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31));
  const employeeIds: Record<string, string> = {};

  for (const [index, spec] of EMPLOYEES.entries()) {
    const fullName = `${spec.firstName} ${spec.lastName}`;
    const userId = spec.roleKey ? userIds[spec.roleKey] : undefined;

    let employee = await db.employee.findFirst({
      where: { firstName: spec.firstName, lastName: spec.lastName },
    });

    if (!employee) {
      employee = await db.employee.create({
        data: {
          organisationId,
          employeeNumber: await nextReference("EMP"),
          userId: userId ?? null,
          firstName: spec.firstName,
          lastName: spec.lastName,
          email: spec.roleKey ? `${spec.firstName.toLowerCase()}@nopedi.co.za` : null,
          jobTitle: spec.jobTitle,
          department: spec.department,
          employmentType: spec.employmentType ?? "PERMANENT",
          startedAt: days(-spec.startedDaysAgo),
        },
      });
      summary.employees += 1;
    }
    employeeIds[fullName] = employee.id;

    // Balances for the cycle in progress, part-used, so the screens show a
    // register in motion rather than a set of untouched entitlements. Accrual
    // takes over from here: it credits from these figures forward.
    for (const [code, entitled, taken] of [
      ["ANNUAL", 15, index % 4 === 0 ? 9 : index % 3],
      ["SICK", 10, index % 5 === 0 ? 4 : 0],
      ["FAMILY", 3, 0],
    ] as Array<[string, number, number]>) {
      const already = await db.leaveBalance.findFirst({
        where: {
          employeeId: employee.id,
          leaveTypeId: leaveTypeIds[code],
          cycleStartsAt: cycleStart,
        },
      });
      if (already) continue;

      await db.leaveBalance.create({
        data: {
          organisationId,
          employeeId: employee.id,
          leaveTypeId: leaveTypeIds[code],
          cycleStartsAt: cycleStart,
          cycleEndsAt: cycleEnd,
          entitledDays: entitled,
          takenDays: taken,
          /*
           * Marked as already accrued to the start of this month. Without it
           * the first accrual run would credit every month of the cycle again
           * on top of the entitlement seeded here, and every balance would be
           * roughly double what the policy says.
           */
          accruedThroughAt: new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
          ),
        },
      });
      summary.balances += 1;
    }

    for (const cert of spec.certifications ?? []) {
      const already = await db.complianceItem.findFirst({
        where: {
          entityType: "EMPLOYEE",
          entityId: employee.id,
          requirementName: cert.name,
        },
      });
      if (already) continue;

      await db.complianceItem.create({
        data: {
          organisationId,
          category: cert.category,
          entityType: "EMPLOYEE",
          entityId: employee.id,
          requirementName: cert.name,
          providerName: cert.providerName,
          issuedAt: days(cert.expiresInDays === null ? -730 : cert.expiresInDays - 730),
          expiresAt: cert.expiresInDays === null ? null : days(cert.expiresInDays),
        },
      });
      summary.certifications += 1;
    }
  }

  // ---- Leave requests -----------------------------------------------------
  for (const spec of LEAVE_REQUESTS) {
    const employeeId = employeeIds[spec.who];
    if (!employeeId) continue;

    const already = await db.leaveRequest.findFirst({
      where: {
        employeeId,
        leaveTypeId: leaveTypeIds[spec.code],
        startsAt: days(spec.startsInDays),
      },
    });
    if (already) continue;

    await db.leaveRequest.create({
      data: {
        organisationId,
        reference: await nextReference("LV"),
        employeeId,
        leaveTypeId: leaveTypeIds[spec.code],
        startsAt: days(spec.startsInDays),
        endsAt: days(spec.endsInDays),
        days: spec.days,
        reason: spec.reason,
        ...(spec.approved
          ? {
              status: "APPROVED" as const,
              decidedById: params.decidedById ?? null,
              decidedAt: days(spec.startsInDays - 8),
            }
          : {}),
      },
    });
    summary.leaveRequests += 1;
  }

  return summary;
}
