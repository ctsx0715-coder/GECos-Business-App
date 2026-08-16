import { db } from "@/lib/database/client";
import { nextReference } from "@/lib/database/reference-numbers";
import { isoDate, statutoryHolidays } from "@/modules/hr/public-holidays";
import { PATTERN_ANCHOR, worksOn } from "@/modules/hr/work-patterns";
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

/** `offset` days from today, or from `base` when one is given, at UTC midnight. */
function days(offset: number, base?: Date): Date {
  const date = base ? new Date(base) : new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

/**
 * The shifts the sites run.
 *
 * Minutes from midnight, so the night shift is expressible: 18:00 to 06:00 is
 * an ordinary shift that happens to end the following morning.
 */
export const SHIFTS: Array<{
  code: string;
  name: string;
  description: string;
  startsAtMinutes: number;
  endsAtMinutes: number;
  breakMinutes: number;
  sortOrder: number;
}> = [
  {
    code: "DAY",
    name: "Day shift",
    description: "07:00 to 16:00 with an hour for lunch. The ordinary site day.",
    startsAtMinutes: 7 * 60,
    endsAtMinutes: 16 * 60,
    breakMinutes: 60,
    sortOrder: 1,
  },
  {
    code: "NIGHT",
    name: "Night shift",
    description:
      "18:00 to 06:00, ending the following morning. Worked on the rotation, where the plant runs through the night.",
    startsAtMinutes: 18 * 60,
    endsAtMinutes: 6 * 60,
    breakMinutes: 60,
    sortOrder: 2,
  },
  {
    code: "SAT_HALF",
    name: "Saturday half-day",
    description: "07:00 to 13:00, no break. The six-day week's short day.",
    startsAtMinutes: 7 * 60,
    endsAtMinutes: 13 * 60,
    breakMinutes: 0,
    sortOrder: 3,
  },
];

/** Which shift each pattern is worked on. */
const SHIFT_BY_PATTERN: Record<string, string> = {
  SITE_6DAY: "DAY",
  ROTATION_14_7: "NIGHT",
};

/**
 * How Nopedi's people work.
 *
 * The office keeps an ordinary week; the sites work six days, which is the
 * common arrangement in construction and the reason patterns exist at all;
 * and the plant operator is on a rotation, which is the case a row of seven
 * booleans could not have expressed.
 */
export const WORK_PATTERNS: Array<{
  code: string;
  name: string;
  description: string;
  cycleDays: number;
  workingDayIndexes: number[];
  hoursPerDay: number;
  rotationWeeks: number | null;
  maxConsecutiveTurns: number | null;
  isDefault: boolean;
}> = [
  {
    code: "OFFICE",
    name: "Office — Monday to Friday",
    description: "Eight hours a day, weekends off. The default for anyone not on site.",
    cycleDays: 7,
    workingDayIndexes: [0, 1, 2, 3, 4],
    hoursPerDay: 8,
    // Nobody rotates off the office week, and nobody is hard done by being on
    // it — which is why the fairness watch has to be able to leave a pattern
    // alone. A warning that fires on everybody is one nobody reads.
    rotationWeeks: null,
    maxConsecutiveTurns: null,
    isDefault: true,
  },
  {
    code: "SITE_6DAY",
    name: "Site — six-day week",
    description:
      "Monday to Saturday. A week of leave costs six days rather than five, which is what it actually costs the site.",
    cycleDays: 7,
    workingDayIndexes: [0, 1, 2, 3, 4, 5],
    hoursPerDay: 9,
    rotationWeeks: 4,
    maxConsecutiveTurns: 4,
    isDefault: false,
  },
  {
    code: "ROTATION_14_7",
    name: "Rotation — 14 on, 7 off",
    description:
      "Fourteen days worked and seven off, repeating. Leave booked in the off week costs nothing, because nothing was going to be worked.",
    cycleDays: 21,
    workingDayIndexes: Array.from({ length: 14 }, (_, index) => index),
    hoursPerDay: 10,
    // Three weeks is one turn of the cycle, and three of those in a row on
    // nights is where somebody should be asked whether it is still fair.
    rotationWeeks: 3,
    maxConsecutiveTurns: 3,
    isDefault: false,
  },
];

/**
 * Who reports to whom.
 *
 * Needed the moment leave has to reach "their manager": a chain that resolves
 * to nobody falls back to whoever may approve leave, which is right as a
 * fallback and useless as a demonstration. Anybody unlisted reports to the
 * Managing Director, which is true of a company this size.
 */
const REPORTS_TO: Record<string, string> = {
  "Anele Dlamini": "Zanele Khoza",
  "Jacob Mthembu": "Zanele Khoza",
  "Katlego Sebego": "Anele Dlamini",
  "Nomsa Zulu": "Anele Dlamini",
  "Pieter van Wyk": "Zanele Khoza",
  "Sipho Ndlovu": "Bongani Sithole",
  "Zanele Khoza": "Thato Chokoe",
  "Bongani Sithole": "Thato Chokoe",
  "Lerato Mokoena": "Thato Chokoe",
  "Refilwe Molefe": "Thato Chokoe",
};

/** Who is on which pattern. Anybody unlisted is on the default. */
const PATTERN_BY_PERSON: Record<string, string> = {
  "Anele Dlamini": "SITE_6DAY",
  "Jacob Mthembu": "SITE_6DAY",
  "Katlego Sebego": "SITE_6DAY",
  "Nomsa Zulu": "SITE_6DAY",
  "Pieter van Wyk": "ROTATION_14_7",
};

/**
 * Turns already worked, so the fairness watch has a history to read.
 *
 * Pieter has had the night rotation three times running, which is exactly the
 * limit the pattern sets — the demonstration should open with the system
 * saying something, because a fairness rule nobody ever sees fire is a claim
 * rather than a feature. Katlego has a turn written for a fortnight's time and
 * not yet in force, which is the other half: a rotation is decided before it
 * starts.
 */
const TURNS: Array<{
  who: string;
  pattern: string;
  shift?: string;
  startsInDays: number;
  endsInDays: number | null;
  applied: boolean;
  note?: string;
}> = [
  { who: "Pieter van Wyk", pattern: "ROTATION_14_7", startsInDays: -63, endsInDays: -43, applied: true },
  { who: "Pieter van Wyk", pattern: "ROTATION_14_7", startsInDays: -42, endsInDays: -22, applied: true },
  {
    who: "Pieter van Wyk",
    pattern: "ROTATION_14_7",
    startsInDays: -21,
    endsInDays: -1,
    applied: true,
    note: "Third turn running — nobody else is ticketed for the excavator",
  },
  { who: "Anele Dlamini", pattern: "SITE_6DAY", startsInDays: -56, endsInDays: -29, applied: true },
  { who: "Anele Dlamini", pattern: "SITE_6DAY", startsInDays: -28, endsInDays: null, applied: true },
  { who: "Jacob Mthembu", pattern: "SITE_6DAY", startsInDays: -28, endsInDays: null, applied: true },
  { who: "Nomsa Zulu", pattern: "SITE_6DAY", startsInDays: -14, endsInDays: null, applied: true },
  {
    who: "Katlego Sebego",
    pattern: "ROTATION_14_7",
    shift: "NIGHT",
    startsInDays: 14,
    endsInDays: 34,
    applied: false,
    note: "Taking the night rotation off Pieter",
  },
];

/**
 * Time actually worked, so the timesheet opens with a week on it.
 *
 * Four shapes, because they are the four the screen has to tell apart: an
 * ordinary day signed off, a long day still waiting for a signature, a night
 * shift that ends the following morning, and somebody who is on the clock
 * right now. Hours relative to today, so a demonstration in March is not
 * looking at an empty week from November.
 */
/**
 * Who clocks on, and what an ordinary day looks like for them.
 *
 * The days themselves are generated from each person's work pattern over the
 * last three weeks rather than listed, because listing them would be sixty
 * rows that drift out of date the moment the demonstration is run in a
 * different month — and because generating them from the pattern is the whole
 * point: the six-day people show Saturdays and the rotation shows its week off
 * without anybody typing that twice.
 */
const TIMESHEET_CREW: Array<{
  who: string;
  startsAtHour: number;
  hours: number;
  breakMinutes: number;
}> = [
  { who: "Jacob Mthembu", startsAtHour: 7, hours: 9, breakMinutes: 60 },
  { who: "Anele Dlamini", startsAtHour: 7, hours: 9, breakMinutes: 60 },
  { who: "Nomsa Zulu", startsAtHour: 7, hours: 9, breakMinutes: 60 },
  { who: "Katlego Sebego", startsAtHour: 7, hours: 9, breakMinutes: 60 },
  { who: "Pieter van Wyk", startsAtHour: 18, hours: 12, breakMinutes: 60 },
];

/** How far back the generated timesheet goes. Three weeks covers a month-end. */
const TIMESHEET_DAYS = 21;

/**
 * The days that are not ordinary, which are the ones the payroll screen exists
 * to show: a Sunday call-out, a shift worked on a public holiday, a day long
 * enough to break the BCEA's overtime ceiling, something nobody has signed
 * for, and somebody still on the clock.
 *
 * Each is described by what makes it interesting rather than by a date, and
 * the date is found in the window at seed time — a demonstration run in March
 * should show a March Sunday, not an empty one from last August.
 */
const NOTABLE_SHIFTS: Array<{
  who: string;
  on: "SUNDAY" | "PUBLIC_HOLIDAY" | "LATEST_WORKDAY";
  startsAtHour: number;
  hours: number;
  breakMinutes: number;
  approved: boolean;
  note: string;
}> = [
  {
    who: "Anele Dlamini",
    on: "SUNDAY",
    startsAtHour: 7,
    hours: 6,
    breakMinutes: 0,
    approved: true,
    note: "Sunday call-out — pump failure",
  },
  {
    who: "Jacob Mthembu",
    on: "PUBLIC_HOLIDAY",
    startsAtHour: 7,
    hours: 8,
    breakMinutes: 60,
    approved: true,
    note: "Worked the public holiday to keep the fabrication on programme",
  },
  {
    who: "Pieter van Wyk",
    on: "LATEST_WORKDAY",
    startsAtHour: 5,
    hours: 14,
    breakMinutes: 60,
    approved: true,
    note: "Thirteen hours on the clock — past what the BCEA allows",
  },
  {
    who: "Nomsa Zulu",
    on: "LATEST_WORKDAY",
    startsAtHour: 14,
    hours: 4,
    breakMinutes: 0,
    approved: false,
    note: "Site office stocktake — nobody has signed for it yet",
  },
];

/**
 * How many people each thing needs.
 *
 * Three shapes on purpose, because one form covers all of them and the point
 * of the screen is lost if every rule looks alike: a site with a floor and a
 * ceiling, a trade with neither, and a shift that needs one person on it every
 * single day including Sunday.
 */
const STAFFING_RULES: Array<{
  name: string;
  onSite: boolean;
  department?: string;
  shift?: string;
  weekdays: number[];
  minimumPeople: number;
  maximumPeople?: number;
}> = [
  {
    name: "Site crew — day shift",
    onSite: true,
    weekdays: [0, 1, 2, 3, 4, 5],
    minimumPeople: 3,
    maximumPeople: 5,
  },
  {
    name: "Workshop",
    onSite: false,
    department: "Workshop",
    weekdays: [0, 1, 2, 3, 4],
    minimumPeople: 1,
  },
  {
    name: "Plant on nights",
    onSite: false,
    shift: "NIGHT",
    weekdays: [],
    minimumPeople: 1,
  },
];

/**
 * A week of placements, so the roster opens with something on it.
 *
 * Relative to today rather than fixed dates, because a demonstration in
 * March should not show an empty week that was full last November.
 */
const ROSTER: Array<{
  who: string;
  startsInDays: number;
  endsInDays: number;
  note?: string;
}> = [
  { who: "Anele Dlamini", startsInDays: 0, endsInDays: 11 },
  { who: "Jacob Mthembu", startsInDays: 0, endsInDays: 4, note: "Workshop fabrication" },
  { who: "Katlego Sebego", startsInDays: 0, endsInDays: 11 },
  { who: "Pieter van Wyk", startsInDays: 1, endsInDays: 6, note: "Excavator" },
  { who: "Nomsa Zulu", startsInDays: 7, endsInDays: 11, note: "Site office" },
];

export interface HrDemoSummary {
  shifts: number;
  workPatterns: number;
  patternTurns: number;
  reportingLines: number;
  leaveApprovalSteps: number;
  staffingRules: number;
  timeEntries: number;
  leaveTypes: number;
  publicHolidays: number;
  rosterAssignments: number;
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
    shifts: 0,
    workPatterns: 0,
    patternTurns: 0,
    reportingLines: 0,
    leaveApprovalSteps: 0,
    staffingRules: 0,
    timeEntries: 0,
    leaveTypes: 0,
    publicHolidays: 0,
    rosterAssignments: 0,
    employees: 0,
    certifications: 0,
    balances: 0,
    leaveRequests: 0,
  };

  // ---- Shifts -------------------------------------------------------------
  const shiftIds: Record<string, string> = {};
  for (const spec of SHIFTS) {
    const existing = await db.shift.findFirst({ where: { code: spec.code } });
    if (existing) {
      shiftIds[spec.code] = existing.id;
      continue;
    }

    const created = await db.shift.create({
      data: { organisationId, ...spec },
    });
    shiftIds[spec.code] = created.id;
    summary.shifts += 1;
  }

  // ---- Work patterns ------------------------------------------------------
  const patternIds: Record<string, string> = {};
  for (const spec of WORK_PATTERNS) {
    const existing = await db.workPattern.findFirst({ where: { code: spec.code } });
    if (existing) {
      patternIds[spec.code] = existing.id;
      /*
       * A pattern created before shifts existed. Attaching the shift it is
       * actually worked on is the same one-field correction the employee loop
       * makes: the pattern is not changed, it is completed.
       */
      const shiftId = shiftIds[SHIFT_BY_PATTERN[spec.code]];
      if (
        (shiftId && !existing.shiftId) ||
        (spec.rotationWeeks !== null && existing.rotationWeeks === null) ||
        (spec.maxConsecutiveTurns !== null && existing.maxConsecutiveTurns === null)
      ) {
        await db.workPattern.update({
          where: { id: existing.id },
          data: {
            shiftId: existing.shiftId ?? shiftId ?? null,
            rotationWeeks: existing.rotationWeeks ?? spec.rotationWeeks,
            maxConsecutiveTurns:
              existing.maxConsecutiveTurns ?? spec.maxConsecutiveTurns,
          },
        });
      }
      continue;
    }

    const created = await db.workPattern.create({
      data: {
        organisationId,
        code: spec.code,
        name: spec.name,
        description: spec.description,
        cycleDays: spec.cycleDays,
        workingDayIndexes: spec.workingDayIndexes,
        anchorOn: PATTERN_ANCHOR,
        hoursPerDay: spec.hoursPerDay,
        shiftId: shiftIds[SHIFT_BY_PATTERN[spec.code]] ?? null,
        rotationWeeks: spec.rotationWeeks,
        maxConsecutiveTurns: spec.maxConsecutiveTurns,
        isDefault: spec.isDefault,
      },
    });
    patternIds[spec.code] = created.id;
    summary.workPatterns += 1;
  }

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

  // ---- Who signs leave off ------------------------------------------------
  /*
   * A chain rather than a single approver, because "not everyone can just
   * approve stuff" is the rule this demonstrates. Two rungs: the person's own
   * manager always, and HR as well once the absence is long enough to matter
   * to cover and to payroll. A day off does not need two signatures.
   *
   * Skipped entirely if a chain already runs on this trigger — the database
   * refuses two, and somebody's own chain outranks the demonstration's.
   */
  const leaveChainExists = await db.workflowDefinition.findFirst({
    where: { entityType: "LEAVE_REQUEST", triggerEvent: "leave.requested" },
  });

  if (!leaveChainExists) {
    const hrRole = await db.role.findFirst({ where: { key: "hr_manager" } });

    const chain = await db.workflowDefinition.create({
      data: {
        organisationId,
        name: "Leave approval",
        entityType: "LEAVE_REQUEST",
        triggerEvent: "leave.requested",
        isActive: true,
      },
    });

    await db.workflowStep.create({
      data: {
        organisationId,
        workflowDefinitionId: chain.id,
        sortOrder: 0,
        name: "Their manager",
        approverType: "MANAGER",
        slaHours: 48,
      },
    });

    if (hrRole) {
      await db.workflowStep.create({
        data: {
          organisationId,
          workflowDefinitionId: chain.id,
          sortOrder: 1,
          name: "HR, for five days or more",
          approverType: "ROLE",
          approverRoleId: hrRole.id,
          slaHours: 48,
          conditionField: "days",
          conditionOperator: "GTE",
          conditionValue: "5",
        },
      });
    }
    summary.leaveApprovalSteps += hrRole ? 2 : 1;
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
          workPatternId: patternIds[PATTERN_BY_PERSON[fullName]] ?? null,
          startedAt: days(-spec.startedDaysAgo),
        },
      });
      summary.employees += 1;
    } else if (!employee.workPatternId && PATTERN_BY_PERSON[fullName]) {
      /*
       * Somebody created before patterns existed. Giving them the pattern they
       * actually work is the point of the exercise, and it is the one field
       * this backfill will change on a record it did not create.
       */
      employee = await db.employee.update({
        where: { id: employee.id },
        data: { workPatternId: patternIds[PATTERN_BY_PERSON[fullName]] },
      });
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

  // ---- The reporting line -------------------------------------------------
  // A second pass, because a manager has to exist before anybody can point at
  // them. Only ever fills a blank: somebody who has been given a manager in
  // the app keeps the one they were given.
  for (const [name, managerName] of Object.entries(REPORTS_TO)) {
    const employeeId = employeeIds[name];
    const managerId = employeeIds[managerName];
    if (!employeeId || !managerId) continue;

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { managerId: true },
    });
    if (employee?.managerId) continue;

    await db.employee.update({
      where: { id: employeeId },
      data: { managerId },
    });
    summary.reportingLines += 1;
  }

  // ---- Turns on a pattern -------------------------------------------------
  // The history the fairness watch reads. Employees already point at the
  // pattern they are on; these rows say since when, and how many times round
  // it has come to the same person.
  for (const spec of TURNS) {
    const employeeId = employeeIds[spec.who];
    const workPatternId = patternIds[spec.pattern];
    if (!employeeId || !workPatternId) continue;

    const already = await db.patternAssignment.findFirst({
      where: { employeeId, startsOn: days(spec.startsInDays) },
    });
    if (already) continue;

    await db.patternAssignment.create({
      data: {
        organisationId,
        employeeId,
        workPatternId,
        shiftId: spec.shift ? (shiftIds[spec.shift] ?? null) : null,
        startsOn: days(spec.startsInDays),
        endsOn: spec.endsInDays === null ? null : days(spec.endsInDays),
        // A turn that has taken effect is one the employee record already
        // reflects; one that has not is waiting for the day to arrive.
        appliedAt: spec.applied ? days(spec.startsInDays) : null,
        note: spec.note,
      },
    });
    summary.patternTurns += 1;
  }

  // ---- Roster -------------------------------------------------------------
  // Placed on whichever project is running. Without one the placements still
  // stand — a yard day is a real placement — so a tenant with no projects gets
  // a roster rather than nothing.
  const site = await db.project.findFirst({
    where: { status: { in: ["ACTIVE", "PLANNING"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  for (const spec of ROSTER) {
    const employeeId = employeeIds[spec.who];
    if (!employeeId) continue;

    const already = await db.rosterAssignment.findFirst({
      where: { employeeId, startsAt: days(spec.startsInDays) },
    });
    if (already) continue;

    await db.rosterAssignment.create({
      data: {
        organisationId,
        employeeId,
        projectId: site?.id ?? null,
        startsAt: days(spec.startsInDays),
        endsAt: days(spec.endsInDays),
        note: spec.note,
      },
    });
    summary.rosterAssignments += 1;
  }

  // ---- Staffing rules -----------------------------------------------------
  // What each thing needs, so the coverage screen has something to measure
  // against. Without a rule the screen is honest but empty: nothing can be
  // short of a number nobody has written down.
  for (const spec of STAFFING_RULES) {
    const already = await db.staffingRule.findFirst({ where: { name: spec.name } });
    if (already) continue;

    await db.staffingRule.create({
      data: {
        organisationId,
        name: spec.name,
        projectId: spec.onSite ? (site?.id ?? null) : null,
        department: spec.department ?? null,
        shiftId: spec.shift ? (shiftIds[spec.shift] ?? null) : null,
        weekdays: spec.weekdays,
        minimumPeople: spec.minimumPeople,
        maximumPeople: spec.maximumPeople ?? null,
      },
    });
    summary.staffingRules += 1;
  }

  // ---- Time worked --------------------------------------------------------
  /*
   * Three weeks of clock-ins, generated from each person's own pattern rather
   * than listed. That is the only way the demonstration stays true when it is
   * run in a different month, and it means the six-day people show their
   * Saturdays and the plant operator shows his week off without any of it
   * being typed twice.
   *
   * The shift is read from the person exactly as the service reads it at
   * clock-in, so every variance figure on the screen is computed the way a
   * real one would be.
   */
  const workedDays = await db.publicHoliday.findMany({
    where: { observedOn: { gte: days(-TIMESHEET_DAYS), lte: days(0) } },
    select: { observedOn: true },
  });
  const holidayDays = new Set(workedDays.map((row) => isoDate(row.observedOn)));

  async function clockOn(spec: {
    employeeId: string;
    on: Date;
    startsAtHour: number;
    hours: number | null;
    breakMinutes: number;
    approved: boolean;
    note?: string;
  }) {
    const clockedInAt = new Date(spec.on);
    clockedInAt.setUTCHours(spec.startsAtHour, 0, 0, 0);

    const already = await db.timeEntry.findFirst({
      where: { employeeId: spec.employeeId, clockedInAt },
    });
    if (already) return;

    const employee = await db.employee.findUnique({
      where: { id: spec.employeeId },
      select: { shiftId: true, workPattern: { select: { shiftId: true } } },
    });

    await db.timeEntry.create({
      data: {
        organisationId,
        employeeId: spec.employeeId,
        workedOn: days(0, spec.on),
        clockedInAt,
        clockedOutAt:
          spec.hours === null
            ? null
            : new Date(clockedInAt.getTime() + spec.hours * 3_600_000),
        breakMinutes: spec.breakMinutes,
        projectId: site?.id ?? null,
        shiftId: employee?.shiftId ?? employee?.workPattern?.shiftId ?? null,
        note: spec.note,
        approvedAt: spec.approved ? new Date() : null,
        approvedById: spec.approved ? (userIds.project_manager ?? null) : null,
      },
    });
    summary.timeEntries += 1;
  }

  for (const spec of TIMESHEET_CREW) {
    const employeeId = employeeIds[spec.who];
    if (!employeeId) continue;

    const patternSpec =
      WORK_PATTERNS.find(
        (pattern) => pattern.code === PATTERN_BY_PERSON[spec.who],
      ) ?? WORK_PATTERNS.find((pattern) => pattern.isDefault);
    if (!patternSpec) continue;

    const pattern = {
      cycleDays: patternSpec.cycleDays,
      workingDayIndexes: patternSpec.workingDayIndexes,
      anchorOn: PATTERN_ANCHOR,
    };

    // Yesterday backwards: today is left alone so somebody can still be on the
    // clock, and so a demonstration never shows a day that has not happened.
    for (let daysAgo = 1; daysAgo <= TIMESHEET_DAYS; daysAgo += 1) {
      const on = days(-daysAgo);
      if (!worksOn(pattern, on)) continue;
      if (holidayDays.has(isoDate(on))) continue;

      await clockOn({
        employeeId,
        on,
        startsAtHour: spec.startsAtHour,
        hours: spec.hours,
        breakMinutes: spec.breakMinutes,
        approved: true,
      });
    }
  }

  for (const spec of NOTABLE_SHIFTS) {
    const employeeId = employeeIds[spec.who];
    if (!employeeId) continue;

    // The date is found in the window rather than written down, so a March
    // demonstration shows a March Sunday.
    let on: Date | null = null;
    for (let daysAgo = 1; daysAgo <= TIMESHEET_DAYS && !on; daysAgo += 1) {
      const candidate = days(-daysAgo);
      const iso = isoDate(candidate);

      if (spec.on === "SUNDAY" && candidate.getUTCDay() === 0) on = candidate;
      if (spec.on === "PUBLIC_HOLIDAY" && holidayDays.has(iso)) on = candidate;
      if (
        spec.on === "LATEST_WORKDAY" &&
        candidate.getUTCDay() !== 0 &&
        !holidayDays.has(iso)
      ) {
        on = candidate;
      }
    }
    if (!on) continue;

    /*
     * A notable shift replaces the ordinary one generated for that day —
     * otherwise Pieter's fourteen hours would sit on top of his twelve and the
     * screen would report a day nobody could have worked.
     */
    await db.timeEntry.deleteMany({ where: { employeeId, workedOn: on } });

    await clockOn({
      employeeId,
      on,
      startsAtHour: spec.startsAtHour,
      hours: spec.hours,
      breakMinutes: spec.breakMinutes,
      approved: spec.approved,
      note: spec.note,
    });
  }

  // And somebody on the clock right now, which is what the timesheet screen
  // opens on. Three hours ago, so the figure is not zero.
  const onTheClock = employeeIds["Katlego Sebego"];
  if (onTheClock) {
    const since = new Date();
    since.setUTCHours(since.getUTCHours() - 3, 0, 0, 0);
    const already = await db.timeEntry.findFirst({
      where: { employeeId: onTheClock, clockedOutAt: null },
    });
    if (!already) {
      await db.timeEntry.create({
        data: {
          organisationId,
          employeeId: onTheClock,
          workedOn: days(0, since),
          clockedInAt: since,
          clockedOutAt: null,
          breakMinutes: 0,
          projectId: site?.id ?? null,
        },
      });
      summary.timeEntries += 1;
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
