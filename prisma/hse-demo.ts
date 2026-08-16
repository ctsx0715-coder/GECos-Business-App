import { db } from "@/lib/database/client";
import { nextReference } from "@/lib/database/reference-numbers";
import type { ControlType, IncidentKind } from "@/generated/prisma/client";

/**
 * The health and safety demonstration dataset.
 *
 * Written to exercise the module rather than to fill it. Every branch the
 * reportability rules can take is represented by one incident, because the
 * whole claim of the module is that it works out what is owed and by when, and
 * a register of seven near misses proves none of it:
 *
 *   - a near miss that owes nothing at all;
 *   - a burst hydraulic hose that owes the Department and nobody else, because
 *     section 24 is about the workplace being dangerous rather than about
 *     anybody being hurt;
 *   - a hand injury that owes the Compensation Fund and is already late;
 *   - a fall where nobody has yet said how long the man will be off, which is
 *     the state most real incidents are in on the day;
 *   - a back injury that crossed the fourteen-day line, owing both, one filed;
 *   - a reversing accident and a cut hand that are closed out.
 *
 * The corrective actions are deliberately skewed towards briefings and PPE,
 * with two real engineering fixes among them. That is what a real action
 * register looks like, and it makes the "fixes that change the job" tile show
 * something worth arguing about rather than a comfortable 100%.
 *
 * Idempotent, like the HR dataset and for the same reason: the seed builds a
 * database from nothing and the backfill runs against one that has been live
 * for weeks. Each incident is matched on its description, which is distinctive
 * enough to be a natural key and stable across runs.
 */

export interface IncidentSpec {
  kind: IncidentKind;
  /** Days ago it happened. */
  occurredDaysAgo: number;
  /** Days after it happened that it reached the office. Usually nought. */
  reportedAfterDays?: number;
  /** Matched against the seeded projects by name fragment. Null for the yard. */
  site: string | null;
  place?: string;
  /** An employee by "First Last", when one of ours was hurt. */
  injured?: string;
  injuredPersonName?: string;
  description: string;
  immediateAction?: string;
  daysUnableToWork?: number;
  dangerousOccurrence?: boolean;
  /** Days ago the Department was told. Absent means it has not been. */
  filedWithDepartmentDaysAgo?: number;
  filedWithFundDaysAgo?: number;
  externalReference?: string;
  rootCause?: string;
  /** Who looked into it, by role key. */
  investigatedBy?: string;
  /** Who signed it off, by role key. Present only on closed incidents. */
  closedBy?: string;
  actions?: ActionSpec[];
}

export interface ActionSpec {
  description: string;
  control: ControlType;
  /** An employee by "First Last". */
  owner?: string;
  /** Days from today. Negative is overdue. */
  dueInDays: number;
  /** Days ago it was done. Absent means it is still open. */
  doneDaysAgo?: number;
  doneBy?: string;
  note?: string;
}

export const INCIDENTS: IncidentSpec[] = [
  {
    kind: "NEAR_MISS",
    occurredDaysAgo: 4,
    site: "Water treatment",
    place: "Bulk pipe trench, chainage 240",
    description:
      "A trench box was lifted out while two men were still working below it. The banksman stopped the crane before the slings took the weight.",
    immediateAction:
      "Lift stopped, men withdrawn from the trench, crane driver and banksman stood down for the rest of the shift.",
    investigatedBy: "safety_officer",
    rootCause:
      "The lift plan was verbal. Nobody had been given the job of confirming the trench was clear before the box came out.",
    actions: [
      {
        description:
          "No trench box comes out without a written permit signed by the excavation supervisor.",
        control: "ADMINISTRATIVE",
        owner: "Anele Dlamini",
        dueInDays: 5,
      },
      {
        description: "Re-brief both crane crews on the lift plan procedure.",
        control: "ADMINISTRATIVE",
        owner: "Anele Dlamini",
        dueInDays: -2,
      },
    ],
  },
  {
    kind: "PROPERTY_DAMAGE",
    occurredDaysAgo: 26,
    site: null,
    place: "Yard, behind the workshop",
    description:
      "A hydraulic hose on the 8-tonne excavator burst under pressure while the machine was being tracked onto the low-bed. Oil sprayed across the loading area at head height. Nobody was standing in it.",
    immediateAction:
      "Machine shut down and isolated, area coned off, spill kit used on roughly forty litres of oil.",
    dangerousOccurrence: true,
    filedWithDepartmentDaysAgo: 22,
    externalReference: "GP/DEL/2026/1187",
    investigatedBy: "safety_officer",
    rootCause:
      "The hose was four years past its replacement interval. Hose ages were not on the service schedule, so nobody was tracking them.",
    closedBy: "project_manager",
    actions: [
      {
        description:
          "Add hose age and replacement date to the plant service schedule for every machine.",
        control: "ENGINEERING",
        owner: "Pieter van Wyk",
        dueInDays: -14,
        doneDaysAgo: 15,
        doneBy: "project_manager",
        note: "Schedule updated for all eleven machines. Three more hoses were found overdue and replaced.",
      },
      {
        description:
          "Loading and tracking area marked out, nobody on foot inside it while a machine is moving.",
        control: "ENGINEERING",
        owner: "Anele Dlamini",
        dueInDays: -12,
        doneDaysAgo: 13,
        doneBy: "project_manager",
        note: "Bollards and painted walkway in place.",
      },
    ],
  },
  {
    kind: "MEDICAL_TREATMENT",
    occurredDaysAgo: 12,
    reportedAfterDays: 1,
    site: "Water treatment",
    place: "Rebar cutting station",
    injured: "Jacob Mthembu",
    description:
      "Deep laceration across the palm of the left hand while clearing a jammed rebar shear. Eight stitches at the clinic in Mamelodi. Back at work on light duty the following day.",
    immediateAction:
      "First aid on site, driven to the clinic by the site clerk, shear tagged out.",
    daysUnableToWork: 0,
    investigatedBy: "safety_officer",
    rootCause:
      "The shear was cleared with the power on because the isolator is behind a stack of mesh and takes two minutes to reach.",
    actions: [
      {
        description:
          "Move the shear isolator to within arm's reach of the operating position.",
        control: "ENGINEERING",
        owner: "Jacob Mthembu",
        dueInDays: 3,
      },
      {
        description: "Issue cut-resistant gloves to everyone on the rebar station.",
        control: "PPE",
        owner: "Nomsa Zulu",
        dueInDays: -5,
      },
    ],
  },
  {
    kind: "LOST_TIME",
    occurredDaysAgo: 3,
    site: "Water treatment",
    place: "East stair core, level 3",
    injured: "Katlego Sebego",
    description:
      "Fell roughly two metres from the stair core landing where the edge protection had been removed for a material lift and not put back. Landed on scaffold boards below. Taken to hospital for X-rays.",
    immediateAction:
      "Level closed, edge protection reinstated the same afternoon, all lifting through that opening stopped.",
    investigatedBy: "safety_officer",
    actions: [
      {
        description:
          "Permanent hinged edge gate on the stair core opening so it cannot be left off.",
        control: "ENGINEERING",
        owner: "Jacob Mthembu",
        dueInDays: 10,
      },
      {
        description:
          "Edge protection register: anything removed is signed out and signed back the same shift.",
        control: "ADMINISTRATIVE",
        owner: "Anele Dlamini",
        dueInDays: 7,
      },
    ],
  },
  {
    kind: "LOST_TIME",
    occurredDaysAgo: 47,
    site: null,
    place: "Workshop, materials bay",
    injured: "Pieter van Wyk",
    description:
      "Lower back injury lifting a pump casing off a pallet by hand. Signed off work by the doctor, still on restricted duty.",
    immediateAction: "Sent home, doctor the same day.",
    daysUnableToWork: 18,
    filedWithFundDaysAgo: 42,
    externalReference: "W.Cl.2 / 2026-004118",
    investigatedBy: "safety_officer",
    rootCause:
      "There is no lifting aid in the materials bay and the overhead gantry does not reach it.",
    actions: [
      {
        description: "Extend the gantry rail to cover the materials bay.",
        control: "ENGINEERING",
        owner: "Jacob Mthembu",
        dueInDays: -3,
      },
      {
        description: "Manual handling refresher for the workshop.",
        control: "ADMINISTRATIVE",
        owner: "Refilwe Molefe",
        dueInDays: -20,
        doneDaysAgo: 18,
        doneBy: "hr_manager",
        note: "Six people trained. Two more to catch on the next rotation.",
      },
      {
        description: "Back support belts available in the materials bay.",
        control: "PPE",
        owner: "Nomsa Zulu",
        dueInDays: -25,
        doneDaysAgo: 24,
        doneBy: "project_manager",
      },
    ],
  },
  {
    kind: "PROPERTY_DAMAGE",
    occurredDaysAgo: 63,
    site: "Pump station",
    place: "Site entrance",
    description:
      "A delivery vehicle reversed into a stack of formwork panels, damaging six of them. No injuries — the area had been cleared for the delivery.",
    immediateAction: "Panels set aside, delivery driver's company notified.",
    investigatedBy: "project_manager",
    rootCause: "No banksman for reversing deliveries at the entrance.",
    closedBy: "executive",
    actions: [
      {
        description: "Every reversing delivery gets a banksman. No exceptions.",
        control: "ADMINISTRATIVE",
        owner: "Anele Dlamini",
        dueInDays: -50,
        doneDaysAgo: 52,
        doneBy: "project_manager",
        note: "Written into the site rules and the induction.",
      },
    ],
  },
  {
    kind: "FIRST_AID",
    occurredDaysAgo: 78,
    site: null,
    place: "Workshop",
    injured: "Katlego Sebego",
    description:
      "Small cut to the forearm on a burr while deburring a plate. Cleaned and dressed from the site box, back on the job within ten minutes.",
    daysUnableToWork: 0,
    investigatedBy: "safety_officer",
    rootCause: "Working without sleeves on a deburring job.",
    closedBy: "project_manager",
    actions: [
      {
        description: "Long sleeves compulsory on the deburring bench.",
        control: "PPE",
        owner: "Nomsa Zulu",
        dueInDays: -70,
        doneDaysAgo: 71,
        doneBy: "project_manager",
      },
    ],
  },
  {
    kind: "NEAR_MISS",
    occurredDaysAgo: 19,
    site: "Pump station",
    place: "Access road",
    description:
      "A concrete truck came down the haul road at speed while two men were walking up it. They stepped into the cut. No contact.",
    immediateAction: "Driver stopped and spoken to at the gate.",
    investigatedBy: "safety_officer",
    rootCause:
      "The haul road is the only way up and there is no separate pedestrian route.",
    actions: [
      {
        description:
          "Barriered pedestrian walkway alongside the haul road for its full length.",
        control: "ENGINEERING",
        owner: "Anele Dlamini",
        dueInDays: 14,
      },
      {
        description: "20 km/h signs and a speed hump before the bend.",
        control: "ENGINEERING",
        owner: "Anele Dlamini",
        dueInDays: -1,
      },
    ],
  },
];

export interface HseDemoSummary {
  incidents: number;
  actions: number;
}

/** `offset` days from today at UTC midnight; negative is in the past. */
function days(offset: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

/** The same, but at a plausible hour of the working day. */
function daysAtHour(offset: number, hour: number): Date {
  const date = days(offset);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

export async function seedHseDemo(params: {
  organisationId: string;
  userIds: Record<string, string>;
}): Promise<HseDemoSummary> {
  const { organisationId, userIds } = params;
  const summary: HseDemoSummary = { incidents: 0, actions: 0 };

  // Employees and projects are looked up rather than created: this dataset
  // sits on top of the HR one and the main seed, and inventing its own people
  // would give Nopedi two sets of staff.
  const employees = await db.employee.findMany({
    select: { id: true, firstName: true, lastName: true },
  });
  const employeeIdByName = new Map(
    employees.map((employee) => [
      `${employee.firstName} ${employee.lastName}`,
      employee.id,
    ]),
  );

  /**
   * A login by role key, falling back to whoever runs the company.
   *
   * On a fresh seed every role has somebody. On a live database backfilled
   * module by module, some do not — and an incident investigated by nobody is
   * a worse demonstration than one investigated by the managing director.
   */
  const whoever = (roleKey: string | undefined) =>
    roleKey === undefined ? undefined : (userIds[roleKey] ?? userIds.executive);

  const projects = await db.project.findMany({ select: { id: true, name: true } });
  /**
   * A project by name fragment, falling back to the first one there is.
   *
   * The fallback matters more than it looks. The site names come from the main
   * seed and have been renamed once already; an incident that quietly loses
   * its site is a register where nothing can be filtered by where it happened,
   * and it fails silently rather than loudly.
   */
  const findSite = (fragment: string) =>
    (
      projects.find((project) =>
        project.name.toLowerCase().includes(fragment.toLowerCase()),
      ) ?? projects[0]
    )?.id;

  for (const spec of INCIDENTS) {
    const already = await db.incident.findFirst({
      where: { description: spec.description },
      select: { id: true },
    });
    if (already) continue;

    const occurredAt = daysAtHour(-spec.occurredDaysAgo, 9);
    const reportedAt = daysAtHour(
      -spec.occurredDaysAgo + (spec.reportedAfterDays ?? 0),
      14,
    );

    const incident = await db.incident.create({
      data: {
        organisationId,
        reference: await nextReference("INC"),
        kind: spec.kind,
        status: spec.closedBy ? "CLOSED" : spec.investigatedBy ? "INVESTIGATING" : "REPORTED",
        occurredAt,
        reportedAt,
        projectId: spec.site ? findSite(spec.site) : undefined,
        place: spec.place,
        injuredEmployeeId: spec.injured
          ? employeeIdByName.get(spec.injured)
          : undefined,
        injuredPersonName: spec.injuredPersonName,
        description: spec.description,
        immediateAction: spec.immediateAction,
        daysUnableToWork: spec.daysUnableToWork,
        dangerousOccurrence: spec.dangerousOccurrence ?? false,
        reportedToDepartmentAt:
          spec.filedWithDepartmentDaysAgo === undefined
            ? undefined
            : daysAtHour(-spec.filedWithDepartmentDaysAgo, 11),
        reportedToFundAt:
          spec.filedWithFundDaysAgo === undefined
            ? undefined
            : daysAtHour(-spec.filedWithFundDaysAgo, 11),
        externalReference: spec.externalReference,
        rootCause: spec.rootCause,
        investigatedById: whoever(spec.investigatedBy),
        closedAt: spec.closedBy ? daysAtHour(-spec.occurredDaysAgo + 14, 16) : undefined,
        closedById: whoever(spec.closedBy),
      },
    });
    summary.incidents += 1;

    for (const action of spec.actions ?? []) {
      await db.incidentAction.create({
        data: {
          organisationId,
          incidentId: incident.id,
          description: action.description,
          control: action.control,
          assignedToEmployeeId: action.owner
            ? employeeIdByName.get(action.owner)
            : undefined,
          dueAt: days(action.dueInDays),
          completedAt:
            action.doneDaysAgo === undefined
              ? undefined
              : daysAtHour(-action.doneDaysAgo, 15),
          completedById: whoever(action.doneBy),
          completedNote: action.note,
        },
      });
      summary.actions += 1;
    }
  }

  return summary;
}
