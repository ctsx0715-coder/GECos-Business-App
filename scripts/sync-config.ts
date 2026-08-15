import "dotenv/config";
import { rawDb } from "@/lib/database/client";
import {
  ALL_PERMISSION_KEYS,
  MODULES,
  PERMISSIONS,
  SYSTEM_ROLES,
} from "@/lib/permissions";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Reconciles code-owned configuration into an existing database.
 *
 * The seed writes permissions, system roles, their links and the module flags
 * once, when a tenant is created. That was fine while every deploy was also a
 * fresh database, and quietly wrong the first time a module was added to a
 * system already running: HR shipped, its tables migrated, and nobody could
 * see it — because no permission row, no role link and no module flag had ever
 * been written for a tenant that already existed. The only fix on offer was
 * the seed, which truncates every table first.
 *
 * So this runs on every deploy and is safe to run repeatedly. It is the
 * difference between "add a module" and "add a module and rebuild the client's
 * database".
 *
 * Three rules keep it from doing damage:
 *
 *   1. It only ever adds. A permission removed from the catalogue is left in
 *      the database, and a module a tenant switched off stays off.
 *   2. It touches system roles only. A role someone created themselves is
 *      theirs, and its permissions are not ours to rewrite.
 *   3. It never creates people. Users are not configuration.
 */

/** Modules the software actually implements today (ADR-009). */
const IMPLEMENTED = new Set<string>([
  MODULES.CORE,
  MODULES.TENDERS,
  MODULES.CRM,
  MODULES.PROJECTS,
  MODULES.HR,
  MODULES.DOCUMENTS,
  MODULES.REPORTS,
]);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("  DATABASE_URL is not set — skipping configuration sync.");
    return;
  }

  const added = {
    permissions: 0,
    roles: 0,
    roleLinks: 0,
    moduleFlags: 0,
  };

  // 1. The permission catalogue is global and code-owned.
  const permissionResult = await rawDb.permission.createMany({
    data: ALL_PERMISSION_KEYS.map((key) => ({ key, moduleKey: PERMISSIONS[key] })),
    skipDuplicates: true,
  });
  added.permissions = permissionResult.count;

  const permissionIds = new Map(
    (await rawDb.permission.findMany({ select: { id: true, key: true } })).map(
      (permission) => [permission.key, permission.id],
    ),
  );

  const organisations = await rawDb.organisation.findMany({
    select: { id: true, name: true },
  });

  for (const organisation of organisations) {
    // 2. Every module needs a row, but an existing one is left exactly as the
    //    tenant set it — including switched off.
    const existingModules = new Set(
      (
        await rawDb.organisationModule.findMany({
          where: { organisationId: organisation.id },
          select: { moduleKey: true },
        })
      ).map((row) => row.moduleKey),
    );

    for (const moduleKey of Object.values(MODULES)) {
      if (existingModules.has(moduleKey)) continue;
      await rawDb.organisationModule.create({
        data: {
          organisationId: organisation.id,
          moduleKey,
          isEnabled: IMPLEMENTED.has(moduleKey),
        },
      });
      added.moduleFlags += 1;
    }

    // 3. System roles, and the permissions they are defined to hold.
    for (const [key, definition] of Object.entries(SYSTEM_ROLES)) {
      let role = await rawDb.role.findFirst({
        where: { organisationId: organisation.id, key },
        select: { id: true },
      });

      if (!role) {
        role = await rawDb.role.create({
          data: {
            organisationId: organisation.id,
            key,
            name: definition.name,
            description: definition.description,
            isSystem: true,
          },
          select: { id: true },
        });
        added.roles += 1;
      }

      const held = new Set(
        (
          await rawDb.rolePermission.findMany({
            where: { roleId: role.id },
            select: { permission: { select: { key: true } } },
          })
        ).map((row) => row.permission.key),
      );

      const missing = (definition.permissions as PermissionKey[])
        .filter((permission) => !held.has(permission))
        .map((permission) => ({
          roleId: role.id,
          permissionId: permissionIds.get(permission),
        }))
        .filter(
          (row): row is { roleId: string; permissionId: string } =>
            row.permissionId !== undefined,
        );

      if (missing.length > 0) {
        const result = await rawDb.rolePermission.createMany({
          data: missing,
          skipDuplicates: true,
        });
        added.roleLinks += result.count;
      }
    }
  }

  const total = Object.values(added).reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    console.log("Configuration already in sync.");
  } else {
    console.log("Configuration synced:", added);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => rawDb.$disconnect());
