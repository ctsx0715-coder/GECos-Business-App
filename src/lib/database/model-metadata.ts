/**
 * Which behaviours the Prisma extension applies to which models.
 *
 * This is declared explicitly rather than derived from Prisma's runtime
 * datamodel, because that lives behind internal entrypoints that churn between
 * releases. The safety net is `model-metadata.test.ts`, which parses
 * prisma/schema.prisma and fails if a model is added without being registered
 * here. That gives the guarantee ADR-007 asks for — a module written six months
 * from now cannot quietly opt out of tenancy, soft delete or audit.
 */

/** Models carrying an `organisationId` that the extension must scope. */
export const TENANT_SCOPED_MODELS = new Set<string>([
  "Employee",
  "PayrollPolicy",
  "TimeEntry",
  "StaffingRule",
  "PatternAssignment",
  "Shift",
  "RosterAssignment",
  "WorkPattern",
  "LeaveType",
  "LeaveBalance",
  "LeaveRequest",
  "PublicHoliday",
  "Project",
  "ProjectMember",
  "ProjectMilestone",
  "ProjectTask",
  "ProjectExpense",
  "Contact",
  "Lead",
  "Opportunity",
  "Activity",
  "OrganisationModule",
  "User",
  "Role",
  "ReferenceSequence",
  "Customer",
  "Tender",
  "TenderRequirement",
  "Document",
  "ComplianceItem",
  "WorkflowDefinition",
  "WorkflowStep",
  "WorkflowInstance",
  "WorkflowApproval",
  "Notification",
  "AuditLog",
]);

/**
 * Models deliberately outside tenant scoping, with the reason. Anything not in
 * this map and not in TENANT_SCOPED_MODELS is an error the test will catch.
 */
export const UNSCOPED_MODELS = new Map<string, string>([
  ["Organisation", "is the tenant itself"],
  ["Permission", "global catalogue of verbs the software supports"],
  ["RolePermission", "join table, scoped through its role"],
  ["UserRole", "join table, scoped through its user"],
  ["DocumentVersion", "scoped through its parent document"],
]);

/** Models with `deletedAt`, where delete becomes an update (ADR-007). */
export const SOFT_DELETE_MODELS = new Set<string>([
  "Employee",
  "PayrollPolicy",
  "TimeEntry",
  "StaffingRule",
  "PatternAssignment",
  "Shift",
  "RosterAssignment",
  "WorkPattern",
  "LeaveType",
  "LeaveRequest",
  "PublicHoliday",
  "Project",
  "ProjectMember",
  "ProjectMilestone",
  "ProjectTask",
  "ProjectExpense",
  "Contact",
  "Lead",
  "Opportunity",
  "Activity",
  "Organisation",
  "User",
  "Role",
  "Customer",
  "Tender",
  "TenderRequirement",
  "Document",
  "ComplianceItem",
  "WorkflowDefinition",
  "WorkflowStep",
  "WorkflowInstance",
  "WorkflowApproval",
]);

/** Models with a `recordStatus` column to keep in step with `deletedAt`. */
export const RECORD_STATUS_MODELS = new Set<string>([
  "Employee",
  "PayrollPolicy",
  "TimeEntry",
  "StaffingRule",
  "PatternAssignment",
  "Shift",
  "RosterAssignment",
  "WorkPattern",
  "LeaveType",
  "LeaveRequest",
  "PublicHoliday",
  "Project",
  "ProjectTask",
  "ProjectExpense",
  "Contact",
  "Lead",
  "Opportunity",
  "Activity",
  "Organisation",
  "User",
  "Role",
  "Customer",
  "Tender",
  "TenderRequirement",
  "Document",
  "ComplianceItem",
  "WorkflowDefinition",
]);

/** Models carrying `createdBy` / `updatedBy` for the extension to stamp. */
export const ACTOR_STAMPED_MODELS = new Set<string>([
  "Employee",
  "PayrollPolicy",
  "TimeEntry",
  "StaffingRule",
  "PatternAssignment",
  "Shift",
  "RosterAssignment",
  "WorkPattern",
  "LeaveType",
  "LeaveRequest",
  "PublicHoliday",
  "Project",
  "ProjectTask",
  "ProjectExpense",
  "Contact",
  "Lead",
  "Opportunity",
  "Activity",
  "User",
  "Role",
  "Customer",
  "Tender",
  "TenderRequirement",
  "Document",
  "ComplianceItem",
  "WorkflowDefinition",
]);

/**
 * Models excluded from audit logging.
 *
 * AuditLog itself would recurse. Notification is high-volume machine-generated
 * noise, and every notification already traces back to the audited action that
 * produced it.
 */
export const AUDIT_EXCLUDED_MODELS = new Set<string>([
  "AuditLog",
  "Notification",
]);

export function isTenantScoped(model: string | undefined): boolean {
  return model !== undefined && TENANT_SCOPED_MODELS.has(model);
}

export function isSoftDeletable(model: string | undefined): boolean {
  return model !== undefined && SOFT_DELETE_MODELS.has(model);
}

export function isAudited(model: string | undefined): boolean {
  if (model === undefined) return false;
  if (AUDIT_EXCLUDED_MODELS.has(model)) return false;
  return TENANT_SCOPED_MODELS.has(model);
}
