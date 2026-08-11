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
  "core.audit.view": MODULES.CORE,

  // CRM
  "crm.customer.view": MODULES.CRM,
  "crm.customer.create": MODULES.CRM,
  "crm.customer.edit": MODULES.CRM,
  "crm.customer.delete": MODULES.CRM,

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
  tender_officer: {
    name: "Tender Officer",
    description: "Compiles and submits tenders. Cannot approve them.",
    permissions: [
      "tenders.tender.view",
      "tenders.tender.create",
      "tenders.tender.edit",
      "tenders.tender.submit_for_approval",
      "crm.customer.view",
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
    ],
  },
  employee: {
    name: "Employee",
    description: "Baseline access for everyone.",
    permissions: ["reports.dashboard.view", "documents.document.view"],
  },
};
