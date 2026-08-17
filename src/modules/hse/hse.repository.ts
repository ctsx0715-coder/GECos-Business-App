import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";
import type { Prisma, IncidentStatus } from "@/generated/prisma/client";

/** Data access for the incident register. No rules, no permission checks (ADR-008). */

function tenant() {
  return requireRequestContext().organisationId;
}

/** Everything a screen needs to name the people and the site involved. */
const WITH_PEOPLE = {
  project: { select: { id: true, name: true, reference: true } },
  injuredEmployee: {
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  },
  investigatedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

export const hseRepository = {
  list(status?: IncidentStatus[]) {
    return db.incident.findMany({
      where: status?.length ? { status: { in: status } } : undefined,
      orderBy: { occurredAt: "desc" },
      include: {
        ...WITH_PEOPLE,
        _count: { select: { actions: true } },
      },
    });
  },

  findById(id: string) {
    return db.incident.findUnique({
      where: { id },
      include: {
        ...WITH_PEOPLE,
        closedBy: { select: { id: true, firstName: true, lastName: true } },
        actions: {
          orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }],
          include: {
            assignedToEmployee: {
              select: { id: true, firstName: true, lastName: true },
            },
            completedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  },

  create(data: Omit<Prisma.IncidentUncheckedCreateInput, "organisationId">) {
    return db.incident.create({ data: { ...data, organisationId: tenant() } });
  },

  update(id: string, data: Prisma.IncidentUncheckedUpdateInput) {
    return db.incident.update({ where: { id }, data });
  },

  /**
   * Every incident in a window, for the safety numbers.
   *
   * Only the four fields the arithmetic needs. The register carries names and
   * injuries, and a dashboard has no business loading either.
   */
  between(from: Date, to: Date) {
    return db.incident.findMany({
      where: { occurredAt: { gte: from, lte: to } },
      orderBy: { occurredAt: "asc" },
      select: {
        id: true,
        kind: true,
        occurredAt: true,
        daysUnableToWork: true,
      },
    });
  },

  /** The most recent lost-time injury of any kind, however far back it is. */
  lastLostTime() {
    return db.incident.findFirst({
      where: { kind: { in: ["LOST_TIME", "PERMANENT_DISABILITY", "FATALITY"] } },
      orderBy: { occurredAt: "desc" },
      select: { id: true, kind: true, occurredAt: true, daysUnableToWork: true },
    });
  },

  /**
   * Minutes worked in a window, from signed-off timesheet entries.
   *
   * The denominator of every safety rate. Deliberately the same "approved
   * only" rule payroll uses: a company should not be reporting its injury rate
   * against hours it would not pay for.
   */
  async minutesWorkedBetween(from: Date, to: Date): Promise<number> {
    const entries = await db.timeEntry.findMany({
      where: {
        workedOn: { gte: from, lte: to },
        approvedAt: { not: null },
        clockedOutAt: { not: null },
      },
      select: { clockedInAt: true, clockedOutAt: true, breakMinutes: true },
    });

    return entries.reduce((total, entry) => {
      const out = entry.clockedOutAt!.getTime();
      const worked = (out - entry.clockedInAt.getTime()) / 60_000;
      return total + Math.max(0, Math.round(worked) - entry.breakMinutes);
    }, 0);
  },

  /**
   * The two lists the report form needs to fill in its dropdowns.
   *
   * Deliberately narrower than the project register and the employee register.
   * A labourer reporting a near miss holds neither `projects.project.view` nor
   * `hr.employee.view`, and would otherwise be left typing the site name into
   * a free-text box — which is how a register ends up with "Menlyn", "menlyn
   * site" and "MLN" as three different places. What comes back is names and
   * ids and nothing else: no budgets, no salaries, no employment records.
   */
  reportingOptions() {
    return Promise.all([
      db.project.findMany({
        where: { status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.employee.findMany({
        where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
  },

  createAction(
    data: Omit<Prisma.IncidentActionUncheckedCreateInput, "organisationId">,
  ) {
    return db.incidentAction.create({ data: { ...data, organisationId: tenant() } });
  },

  findAction(id: string) {
    return db.incidentAction.findUnique({
      where: { id },
      include: { incident: { select: { id: true, reference: true, status: true } } },
    });
  },

  updateAction(id: string, data: Prisma.IncidentActionUncheckedUpdateInput) {
    return db.incidentAction.update({ where: { id }, data });
  },

  countOpenActions(incidentId: string) {
    return db.incidentAction.count({
      where: { incidentId, completedAt: null },
    });
  },

  /** Actions still owed, oldest deadline first. The list somebody chases. */
  openActions() {
    return db.incidentAction.findMany({
      where: { completedAt: null },
      orderBy: { dueAt: "asc" },
      include: {
        incident: { select: { id: true, reference: true, kind: true } },
        assignedToEmployee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  },

  /** Controls used across the register, for the hierarchy-of-control share. */
  controlsUsed() {
    return db.incidentAction.findMany({ select: { control: true } });
  },

  /** Every incident with a filing still outstanding is worked out in the service. */
  needingAttention() {
    return db.incident.findMany({
      where: { status: { not: "CLOSED" } },
      orderBy: { occurredAt: "asc" },
      include: WITH_PEOPLE,
    });
  },
};
