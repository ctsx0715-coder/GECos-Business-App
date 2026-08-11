import { db, rawDb } from "@/lib/database/client";
import { withSystemContext } from "@/lib/database/tenant-context";
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  SYSTEM_ROLES,
} from "@/lib/permissions/catalogue";
import type { PermissionKey } from "@/lib/permissions/catalogue";

/** Wipes every tenant table. Organisations cascade to everything else. */
export async function resetDatabase() {
  await rawDb.$executeRawUnsafe("TRUNCATE organisations CASCADE");
  await rawDb.$executeRawUnsafe("TRUNCATE permissions CASCADE");
}

/** The global permission catalogue, which is not tenant scoped. */
export async function seedPermissions() {
  await rawDb.permission.createMany({
    data: ALL_PERMISSION_KEYS.map((key) => ({
      key,
      moduleKey: PERMISSIONS[key],
    })),
    skipDuplicates: true,
  });
}

export interface SeededOrg {
  organisationId: string;
  roleIds: Record<string, string>;
  userIds: Record<string, string>;
}

/**
 * A tenant with the system roles and one user per role.
 *
 * Users are keyed by role, so a test can read as `users.tender_officer` and
 * mean "somebody who can compile a bid but not approve it".
 */
export async function seedOrganisation(name: string): Promise<SeededOrg> {
  const organisation = await rawDb.organisation.create({ data: { name } });

  const roleIds: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  await withSystemContext(organisation.id, async () => {
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
        where: { key: { in: definition.permissions as PermissionKey[] } },
        select: { id: true },
      });
      await rawDb.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });

      const user = await db.user.create({
        data: {
          organisationId: organisation.id,
          email: `${key}@${name.toLowerCase().replace(/\W+/g, "")}.co.za`,
          firstName: definition.name,
          lastName: "Test",
        },
      });
      userIds[key] = user.id;
      await rawDb.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }
  });

  return { organisationId: organisation.id, roleIds, userIds };
}

/**
 * A two-step approval chain for tenders: finance, then an executive.
 * Mirrors the "Tender Submission → Finance → Director" example in the brief.
 */
export async function seedTenderApprovalWorkflow(org: SeededOrg) {
  return withSystemContext(org.organisationId, async () => {
    const definition = await db.workflowDefinition.create({
      data: {
        organisationId: org.organisationId,
        name: "Tender submission approval",
        entityType: "TENDER",
        triggerEvent: "tender.submitted_for_approval",
        isActive: true,
      },
    });

    await db.workflowStep.create({
      data: {
        organisationId: org.organisationId,
        workflowDefinitionId: definition.id,
        sortOrder: 0,
        name: "Finance review",
        approverType: "ROLE",
        approverRoleId: org.roleIds.finance_manager,
        slaHours: 48,
      },
    });

    await db.workflowStep.create({
      data: {
        organisationId: org.organisationId,
        workflowDefinitionId: definition.id,
        sortOrder: 1,
        name: "Executive sign-off",
        approverType: "USER",
        approverUserId: org.userIds.executive,
        slaHours: 24,
      },
    });

    return definition;
  });
}
