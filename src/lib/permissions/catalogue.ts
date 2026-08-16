/**
 * The permission catalogue — every verb the software supports.
 *
 * Global, not per tenant: these are what the code can check, identical for
 * every customer. Roles are per tenant and map onto these (ADR-002).
 *
 * Keys are `module.action`. The seed writes them into the permissions table;
 * this file is the source of truth for both the seed and the type system, so a
 * typo in a permission check fails to compile rather than failing open.
 */

export const MODULES = {
  CORE: "core",
  CRM: "crm",
  TENDERS: "tenders",
  PROJECTS: "projects",
  HR: "hr",
  HSE: "hse",
  PROCUREMENT: "procurement",
  INVENTORY: "inventory",
  ASSETS: "assets",
  FINANCE: "finance",
  DOCUMENTS: "documents",
  REPORTS: "reports",
} as const;

export type ModuleKey = (typeof MODULES)[keyof typeof MODULES];

export const PERMISSIONS = {
  // Core / administration
  "core.settings.view": MODULES.CORE,
  "core.settings.edit": MODULES.CORE,
  "core.users.view": MODULES.CORE,
  "core.users.manage": MODULES.CORE,
  "core.roles.manage": MODULES.CORE,
  /// Defining who approves what, and in which order. Separate from approving
  /// anything: the person who decides that a tender over R5m needs the MD is
  /// not necessarily the MD, and somebody who can rewrite the chain can
  /// approve anything by writing themselves into it.
  "core.workflow.view": MODULES.CORE,
  "core.workflow.manage": MODULES.CORE,
  "core.audit.view": MODULES.CORE,

  // CRM
  "crm.customer.view": MODULES.CRM,
  "crm.customer.create": MODULES.CRM,
  "crm.customer.edit": MODULES.CRM,
  "crm.customer.delete": MODULES.CRM,
  "crm.contact.view": MODULES.CRM,
  "crm.contact.manage": MODULES.CRM,
  "crm.lead.view": MODULES.CRM,
  "crm.lead.create": MODULES.CRM,
  "crm.lead.edit": MODULES.CRM,
  /// Turn a qualified lead into a customer and an opportunity.
  "crm.lead.convert": MODULES.CRM,
  "crm.opportunity.view": MODULES.CRM,
  "crm.opportunity.create": MODULES.CRM,
  "crm.opportunity.edit": MODULES.CRM,
  "crm.opportunity.delete": MODULES.CRM,
  /// Close a deal as won or lost. Separate from editing, because the forecast
  /// is only as trustworthy as the discipline around closing.
  "crm.opportunity.close": MODULES.CRM,
  "crm.activity.log": MODULES.CRM,

  // Tenders
  "tenders.tender.view": MODULES.TENDERS,
  "tenders.tender.create": MODULES.TENDERS,
  "tenders.tender.edit": MODULES.TENDERS,
  "tenders.tender.delete": MODULES.TENDERS,
  /// Send a tender into the approval workflow.
  "tenders.tender.submit_for_approval": MODULES.TENDERS,
  /// Decide on an approval step. Distinct from submitting, deliberately.
  "tenders.tender.approve": MODULES.TENDERS,
  /// Record the outcome once the client has decided.
  "tenders.tender.record_outcome": MODULES.TENDERS,

  // Projects
  "projects.project.view": MODULES.PROJECTS,
  "projects.project.create": MODULES.PROJECTS,
  "projects.project.edit": MODULES.PROJECTS,
  "projects.project.delete": MODULES.PROJECTS,
  /// Close a project out. Separate from editing.
  "projects.project.close": MODULES.PROJECTS,
  "projects.team.manage": MODULES.PROJECTS,
  "projects.task.view": MODULES.PROJECTS,
  "projects.task.manage": MODULES.PROJECTS,
  "projects.expense.view": MODULES.PROJECTS,
  "projects.expense.submit": MODULES.PROJECTS,
  /// Approving spend is what commits it against the budget, so it is its own
  /// permission rather than part of editing a project.
  "projects.expense.approve": MODULES.PROJECTS,

  // HR
  "hr.employee.view": MODULES.HR,
  "hr.employee.create": MODULES.HR,
  "hr.employee.edit": MODULES.HR,
  /// Exiting someone is separated from editing them: it ends their access,
  /// closes their leave and starts a statutory retention clock.
  "hr.employee.exit": MODULES.HR,
  "hr.certification.view": MODULES.HR,
  "hr.certification.manage": MODULES.HR,
  /// Seeing everyone's leave. Seeing your own needs no permission — it is
  /// your record, and requiring one would lock every employee out of it.
  "hr.leave.view": MODULES.HR,
  "hr.leave.request": MODULES.HR,
  "hr.leave.approve": MODULES.HR,
  /// Writing entitlements. Separate from approving, because someone who can
  /// top up a balance and approve against it needs no approver at all.
  "hr.leave.configure": MODULES.HR,
  /// Seeing who is placed where. Wider than managing it: a foreman needs to
  /// read next week's roster without being able to rewrite it.
  "hr.roster.view": MODULES.HR,
  "hr.roster.manage": MODULES.HR,

  /*
   * Time is four verbs rather than two, because they are held by different
   * people. Clocking yourself in is baseline; clocking somebody else in is a
   * supervisor's job; reading everybody's card is HR's; and signing a week off
   * for payroll is the one that costs money, so it is not the same permission
   * as recording it.
   */
  "hr.timesheet.view": MODULES.HR,
  "hr.timesheet.record": MODULES.HR,
  "hr.timesheet.manage": MODULES.HR,
  "hr.timesheet.approve": MODULES.HR,

  /*
   * Payroll sits between HR and finance, which is why it is its own verb
   * rather than part of either. It reads what everybody worked and hands it to
   * whoever runs the pay run — a narrower thing than managing people and a
   * wider one than approving a week.
   */
  "hr.payroll.export": MODULES.HR,

  /*
   * Health and safety.
   *
   * Reporting is deliberately not gated. A near-miss system that asks whether
   * you are allowed to use it collects nothing, and the whole value of one is
   * that the man who nearly got hit tells somebody the same afternoon.
   *
   * Reading the register is gated, and harder than it looks: these rows carry
   * named people's injuries, which POPIA treats as special personal
   * information. So "can file one" and "can read them all" are far apart.
   *
   * Closing is separate from investigating, for the same reason a tender
   * officer cannot approve their own tender: the person who decides an
   * incident is finished should not be only the person who investigated it.
   */
  "hse.incident.view": MODULES.HSE,
  "hse.incident.report": MODULES.HSE,
  "hse.incident.investigate": MODULES.HSE,
  "hse.incident.close": MODULES.HSE,
  /// Marking your own corrective action done. Held by people who hold none of
  /// the above — the person who has to fit the handrail is not an investigator.
  "hse.action.complete": MODULES.HSE,

  // Documents
  "documents.document.view": MODULES.DOCUMENTS,
  "documents.document.upload": MODULES.DOCUMENTS,
  "documents.document.delete": MODULES.DOCUMENTS,

  // Reports
  "reports.dashboard.view": MODULES.REPORTS,
  "reports.export": MODULES.REPORTS,
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function moduleForPermission(key: PermissionKey): ModuleKey {
  return PERMISSIONS[key];
}

/**
 * Roles seeded for a new tenant.
 *
 * Deliberately a starting point, not a finished answer. Nopedi's real roles
 * are an open discovery question (docs/02-discovery-questions.md), and these
 * exist so the demo has something concrete for them to correct.
 */
export const SYSTEM_ROLES: Record<
  string,
  { name: string; description: string; permissions: PermissionKey[] }
> = {
  executive: {
    name: "Executive",
    description: "Full visibility, final approval authority.",
    permissions: [...ALL_PERMISSION_KEYS],
  },
  sales_manager: {
    name: "Sales Manager",
    description: "Owns the pipeline from enquiry to close.",
    permissions: [
      "crm.customer.view",
      "crm.customer.create",
      "crm.customer.edit",
      "crm.contact.view",
      "crm.contact.manage",
      "crm.lead.view",
      "crm.lead.create",
      "crm.lead.edit",
      "crm.lead.convert",
      "crm.opportunity.view",
      "crm.opportunity.create",
      "crm.opportunity.edit",
      "crm.opportunity.close",
      "crm.activity.log",
      "tenders.tender.view",
      "documents.document.view",
      "reports.dashboard.view",
      "reports.export",
    ],
  },
  tender_officer: {
    name: "Tender Officer",
    description: "Compiles and submits tenders. Cannot approve them.",
    permissions: [
      "tenders.tender.view",
      "tenders.tender.create",
      "tenders.tender.edit",
      "tenders.tender.submit_for_approval",
      "crm.customer.view",
      "crm.contact.view",
      "crm.opportunity.view",
      "crm.activity.log",
      "documents.document.view",
      "documents.document.upload",
      "reports.dashboard.view",
    ],
  },
  finance_manager: {
    name: "Finance Manager",
    description: "Reviews commercial terms and approves pricing.",
    permissions: [
      "tenders.tender.view",
      "tenders.tender.approve",
      "crm.customer.view",
      "documents.document.view",
      "reports.dashboard.view",
      "reports.export",
      // Sees the chain they sit in, without being able to rewrite it.
      "core.workflow.view",
      // Runs the pay run. Hours, not people: this does not open the employee
      // register, the leave balances or anybody's medical certificate.
      "hr.payroll.export",
    ],
  },
  project_manager: {
    name: "Project Manager",
    description: "Delivers the work and owns the budget.",
    permissions: [
      "projects.project.view",
      "projects.project.create",
      "projects.project.edit",
      "projects.project.close",
      "projects.team.manage",
      "projects.task.view",
      "projects.task.manage",
      "projects.expense.view",
      "projects.expense.submit",
      "projects.expense.approve",
      "crm.customer.view",
      "crm.contact.view",
      "tenders.tender.view",
      "documents.document.view",
      "documents.document.upload",
      "reports.dashboard.view",
      // Approves leave for their own site team.
      "hr.employee.view",
      "hr.leave.view",
      "hr.leave.request",
      "hr.leave.approve",
      // Places their own crews, which is most of what a project manager does
      // with people in a week.
      "hr.roster.view",
      "hr.roster.manage",
      // Clocks the crew in when somebody forgets, and signs the week off.
      "hr.timesheet.view",
      "hr.timesheet.record",
      "hr.timesheet.manage",
      "hr.timesheet.approve",
      // Safety on their own site. Under the Construction Regulations the
      // person in charge of the site carries the duty, so they carry the
      // whole incident lifecycle rather than only the reporting of it.
      "hse.incident.view",
      "hse.incident.report",
      "hse.incident.investigate",
      "hse.incident.close",
      "hse.action.complete",
    ],
  },
  /**
   * Health and safety as its own role.
   *
   * Separate from the project manager because on a site of any size it is a
   * separate person, and separate from HR because the register holds injuries
   * rather than employment records. They can see enough of both to do the job:
   * who the injured person is, and which site it happened on.
   */
  safety_officer: {
    name: "Safety Officer",
    description: "Owns the incident register, investigations and corrective actions.",
    permissions: [
      "hse.incident.view",
      "hse.incident.report",
      "hse.incident.investigate",
      // Deliberately without `hse.incident.close`. Whoever investigated an
      // incident should not also be the one who declares it finished, and a
      // safety officer under pressure to shrink an open list is precisely the
      // person that rule exists for. Closing is the site or executive's.
      "hse.action.complete",
      // Naming the injured person and the site the incident happened on.
      "hr.employee.view",
      "projects.project.view",
      "documents.document.view",
      "documents.document.upload",
      "reports.dashboard.view",
    ],
  },
  /**
   * A dedicated HR role, because the alternative is giving whoever administers
   * people the executive role, which also hands them every tender and every
   * number in the business.
   */
  hr_manager: {
    name: "HR Manager",
    description: "Owns the people register, certifications and leave.",
    permissions: [
      "hr.employee.view",
      "hr.employee.create",
      "hr.employee.edit",
      "hr.employee.exit",
      "hr.certification.view",
      "hr.certification.manage",
      "hr.leave.view",
      "hr.leave.request",
      "hr.leave.approve",
      "hr.leave.configure",
      "hr.roster.view",
      "hr.roster.manage",
      "hr.timesheet.view",
      "hr.timesheet.record",
      "hr.timesheet.manage",
      "hr.timesheet.approve",
      "hr.payroll.export",
      // Injuries reach HR whether or not HR investigates them: a lost-time
      // injury becomes sick leave, and a COIDA claim needs the employee file.
      "hse.incident.view",
      "hse.incident.report",
      "core.users.view",
      "core.workflow.view",
      "documents.document.view",
      "documents.document.upload",
      "reports.dashboard.view",
    ],
  },
  employee: {
    name: "Employee",
    description: "Baseline access for everyone.",
    permissions: [
      "reports.dashboard.view",
      "documents.document.view",
      "projects.task.view",
      "projects.expense.submit",
      // Requesting leave is baseline. Seeing anyone else's is not.
      "hr.leave.request",
      // Where the crew is this week is not a secret from the crew.
      "hr.roster.view",
      // Clocking yourself in and out. Reading anybody else's card is not
      // baseline, and neither is approving your own.
      "hr.timesheet.record",
      // Reporting what nearly happened, and saying when you have fixed the
      // thing you were asked to fix. Neither opens the register.
      "hse.incident.report",
      "hse.action.complete",
    ],
  },
};
