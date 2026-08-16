import { nextReference } from "@/lib/database/reference-numbers";
import { requireRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  addActionSchema,
  closeIncidentSchema,
  completeActionSchema,
  investigateIncidentSchema,
  recordFilingSchema,
  reportIncidentSchema,
} from "@/schemas/hse.schema";
import type { IncidentStatus } from "@/generated/prisma/client";
import { hseRepository } from "./hse.repository";
import { reportability, type IncidentFacts } from "./reportability";
import { safetyRecord, hardControlShare, type ControlType } from "./safety-metrics";

/**
 * Health and safety.
 *
 * Two rules carry the module and both are about not letting things quietly go
 * away. An incident cannot be closed while a corrective action on it is still
 * open, so the action register cannot become a wish list. And whoever
 * investigated it cannot be the only person who declares it finished, for the
 * same reason a tender officer cannot approve their own tender.
 *
 * The statutory filing deadlines are worked out on read rather than stored —
 * see `reportability.ts` for why — which means this service never has to
 * remember to recalculate them when the facts change.
 */

/** Turns a row into the facts the reportability rules need. */
function factsOf(incident: {
  kind: IncidentFacts["kind"];
  occurredAt: Date;
  reportedAt: Date;
  daysUnableToWork: number | null;
  dangerousOccurrence: boolean;
  reportedToDepartmentAt: Date | null;
  reportedToFundAt: Date | null;
}): IncidentFacts {
  return {
    kind: incident.kind,
    occurredAt: incident.occurredAt,
    reportedAt: incident.reportedAt,
    daysUnableToWork: incident.daysUnableToWork,
    dangerousOccurrence: incident.dangerousOccurrence,
    reportedToDepartmentAt: incident.reportedToDepartmentAt,
    reportedToFundAt: incident.reportedToFundAt,
  };
}

export const hseService = {
  async list(status?: IncidentStatus[]) {
    await requirePermission("hse.incident.view");
    const incidents = await hseRepository.list(status);

    // The deadlines come back with the row, because a register that makes you
    // open each incident to find out which one is late is a register nobody
    // reads until an inspector asks.
    return incidents.map((incident) => ({
      ...incident,
      obligations: reportability(factsOf(incident)),
    }));
  },

  async getById(id: string) {
    await requirePermission("hse.incident.view");
    const incident = await hseRepository.findById(id);
    if (!incident) throw new NotFoundError("Incident");

    return { ...incident, obligations: reportability(factsOf(incident)) };
  },

  /**
   * Filing one.
   *
   * The lightest permission in the module on purpose: a near-miss system that
   * asks whether you are allowed to use it collects nothing.
   */
  async report(input: unknown) {
    await requirePermission("hse.incident.report");
    const data = reportIncidentSchema.parse(input);

    return hseRepository.create({
      reference: await nextReference("INC"),
      kind: data.kind,
      status: "REPORTED",
      occurredAt: data.occurredAt,
      projectId: data.projectId,
      place: data.place,
      injuredEmployeeId: data.injuredEmployeeId,
      injuredPersonName: data.injuredPersonName,
      description: data.description,
      immediateAction: data.immediateAction,
      daysUnableToWork: data.daysUnableToWork,
      dangerousOccurrence: data.dangerousOccurrence,
    });
  },

  /**
   * The sites and people a report form can name.
   *
   * Gated on reporting rather than on viewing the register, because the person
   * who most needs to name a site correctly is the labourer who does not hold
   * `projects.project.view`. Names and ids only.
   */
  async reportingOptions() {
    await requirePermission("hse.incident.report");
    const [projects, employees] = await hseRepository.reportingOptions();

    return {
      projects: projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
      employees: employees.map((employee) => ({
        value: employee.id,
        label: `${employee.firstName} ${employee.lastName}`,
      })),
    };
  },

  /**
   * Recording what was found.
   *
   * The classification can change here, and that is deliberate: an incident
   * logged as first aid on Tuesday becomes lost time on Friday when the man
   * does not come back, and it may cross the fourteen-day line weeks later.
   * The reporting duty is recomputed from the new facts every time it is read,
   * so correcting the row corrects the deadline with it.
   */
  async investigate(input: unknown) {
    await requirePermission("hse.incident.investigate");
    const data = investigateIncidentSchema.parse(input);
    const { userId } = requireRequestContext();

    const incident = await hseRepository.findById(data.incidentId);
    if (!incident) throw new NotFoundError("Incident");
    if (incident.status === "CLOSED") {
      throw new BusinessRuleError(
        `${incident.reference} is closed. Reopening it is a decision somebody has to make deliberately.`,
      );
    }

    return hseRepository.update(incident.id, {
      status: "INVESTIGATING",
      investigatedById: incident.investigatedById ?? userId,
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.rootCause !== undefined ? { rootCause: data.rootCause } : {}),
      ...(data.daysUnableToWork !== undefined
        ? { daysUnableToWork: data.daysUnableToWork }
        : {}),
      ...(data.dangerousOccurrence !== undefined
        ? { dangerousOccurrence: data.dangerousOccurrence }
        : {}),
      ...(data.place !== undefined ? { place: data.place } : {}),
    });
  },

  /**
   * Recording that a statutory filing has been made.
   *
   * A claim with legal weight — it is the answer given to an inspector who
   * asks whether the incident was reported — so it is written by a person and
   * never inferred. Nothing here files anything with anybody; the WCL.1 and
   * the W.Cl.2 are submitted outside this system, and this records that they
   * were.
   */
  async recordFiling(input: unknown) {
    await requirePermission("hse.incident.investigate");
    const data = recordFilingSchema.parse(input);

    const incident = await hseRepository.findById(data.incidentId);
    if (!incident) throw new NotFoundError("Incident");

    if (data.filedAt < incident.occurredAt) {
      throw new BusinessRuleError(
        "That is before the incident happened.",
      );
    }

    return hseRepository.update(incident.id, {
      ...(data.to === "DEPARTMENT"
        ? { reportedToDepartmentAt: data.filedAt }
        : { reportedToFundAt: data.filedAt }),
      ...(data.externalReference
        ? { externalReference: data.externalReference }
        : {}),
    });
  },

  async addAction(input: unknown) {
    await requirePermission("hse.incident.investigate");
    const data = addActionSchema.parse(input);

    const incident = await hseRepository.findById(data.incidentId);
    if (!incident) throw new NotFoundError("Incident");
    if (incident.status === "CLOSED") {
      throw new BusinessRuleError(
        `${incident.reference} is closed. An action added now would never be chased.`,
      );
    }

    return hseRepository.createAction({
      incidentId: incident.id,
      description: data.description,
      control: data.control,
      assignedToEmployeeId: data.assignedToEmployeeId,
      dueAt: data.dueAt,
    });
  },

  async completeAction(input: unknown) {
    await requirePermission("hse.action.complete");
    const data = completeActionSchema.parse(input);
    const { userId } = requireRequestContext();

    const action = await hseRepository.findAction(data.actionId);
    if (!action) throw new NotFoundError("Corrective action");
    if (action.completedAt !== null) {
      throw new BusinessRuleError("That action is already done.");
    }

    return hseRepository.updateAction(action.id, {
      completedAt: new Date(),
      completedById: userId,
      completedNote: data.completedNote,
    });
  },

  /**
   * Closing it out.
   *
   * Two things stand in the way, and both are the point of the module.
   *
   * An incident with an open corrective action cannot close. Without that
   * rule the action register is a wish list: closing the incident is the
   * moment everybody stops looking, and an action that outlives that moment
   * never gets done.
   *
   * And whoever investigated it cannot close it. A safety officer under
   * pressure to shrink an open list is exactly the person separation of duties
   * exists for — which is why the seeded Safety Officer role holds
   * `hse.incident.investigate` and not `hse.incident.close`.
   */
  async close(input: unknown) {
    await requirePermission("hse.incident.close");
    const data = closeIncidentSchema.parse(input);
    const { userId } = requireRequestContext();

    const incident = await hseRepository.findById(data.incidentId);
    if (!incident) throw new NotFoundError("Incident");
    if (incident.status === "CLOSED") {
      throw new BusinessRuleError(`${incident.reference} is already closed.`);
    }

    if (incident.investigatedById === userId) {
      throw new ForbiddenError(
        "You investigated this one, so somebody else has to close it.",
      );
    }

    const open = await hseRepository.countOpenActions(incident.id);
    if (open > 0) {
      throw new BusinessRuleError(
        `${open} corrective ${open === 1 ? "action is" : "actions are"} still open. ` +
          "Closing the incident is when everybody stops looking, so it does not close first.",
      );
    }

    return hseRepository.update(incident.id, {
      status: "CLOSED",
      closedAt: new Date(),
      closedById: userId,
      ...(data.rootCause !== undefined ? { rootCause: data.rootCause } : {}),
    });
  },

  /**
   * The safety record for a window, with the hours it is measured against.
   *
   * The denominator is real: approved timesheet minutes for the same period,
   * which is why this module wanted the timesheets built first.
   */
  async record(from: Date, to: Date) {
    await requirePermission("hse.incident.view");

    const [incidents, minutesWorked, last, controls] = await Promise.all([
      hseRepository.between(from, to),
      hseRepository.minutesWorkedBetween(from, to),
      hseRepository.lastLostTime(),
      hseRepository.controlsUsed(),
    ]);

    // "Days since the last lost-time injury" is not a question about the
    // window — a company does not get its counter reset by choosing a later
    // start date — so the most recent one is looked up separately and folded
    // in. Everything else is the window.
    const withinWindow = safetyRecord({ incidents, minutesWorked, asAt: to });
    const overall = safetyRecord({
      incidents: last ? [last] : [],
      minutesWorked,
      asAt: new Date(),
    });

    return {
      from,
      to,
      ...withinWindow,
      lastLostTimeAt: overall.lastLostTimeAt,
      daysSinceLastLostTime: overall.daysSinceLastLostTime,
      hardControlShare: hardControlShare(
        controls.map((row) => row.control as ControlType),
      ),
    };
  },

  /**
   * What is late, across the whole register.
   *
   * Everything still open, with the filings it owes and the actions it is
   * waiting on. This is the screen a safety officer opens on a Monday.
   */
  async whatIsLate(asAt: Date = new Date()) {
    await requirePermission("hse.incident.view");

    const [open, actions] = await Promise.all([
      hseRepository.needingAttention(),
      hseRepository.openActions(),
    ]);

    const filings = open.flatMap((incident) => {
      const report = reportability(factsOf(incident), asAt);
      return report.filings
        .filter((filing) => filing.filedAt === null)
        .map((filing) => ({ incident, filing }));
    });

    return {
      filings: filings.sort(
        (a, b) => a.filing.dueBy.getTime() - b.filing.dueBy.getTime(),
      ),
      overdueActions: actions.filter((action) => action.dueAt < asAt),
      openActions: actions,
      unanswered: open.flatMap((incident) =>
        reportability(factsOf(incident), asAt).unanswered.map((question) => ({
          incident,
          question,
        })),
      ),
    };
  },

  /**
   * Whether the signed-in user may close incidents at all.
   *
   * Asked by the screen so the close form is not offered to somebody who will
   * only be refused. The refusal itself stays in `close` — this is about not
   * showing a dead end, not about enforcement.
   */
  async mayClose(): Promise<boolean> {
    return hasPermission("hse.incident.close");
  },
};
