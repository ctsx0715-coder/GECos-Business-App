import "dotenv/config";
import { rawDb } from "@/lib/database/client";
import {
  ALL_PERMISSION_KEYS,
  MODULES,
  PERMISSIONS,
  SYSTEM_ROLES,
} from "@/lib/permissions";
import type { PermissionKey } from "@/lib/permissions";
import {
  shouldTouchDatabase,
  skipMessage,
  whyItDecided,
} from "./should-touch-database.mjs";

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
 *      the database, and a module the software does not implement is left
 *      switched off.
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
  MODULES.HSE,
  MODULES.PROCUREMENT,
  MODULES.DOCUMENTS,
  MODULES.REPORTS,
]);

async function main() {
  // Same rule as the migration step, from the same place, so the two cannot
  // drift into a preview build writing to the production database.
  const { ok, reason } = shouldTouchDatabase();
  console.log(whyItDecided({ ok, reason }));
  if (!ok) {
    console.warn(skipMessage(reason));
    return;
  }

  const added = {
    permissions: 0,
    roles: 0,
    roleLinks: 0,
    moduleFlags: 0,
    modulesEnabled: 0,
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
    /*
     * 2. Every module needs a row, and every module the software implements is
     *    switched on.
     *
     *    Creating the missing rows is not enough on its own. The seed writes a
     *    row for every module in the catalogue when a tenant is created, and
     *    writes `false` for the ones not built yet — so a tenant seeded before
     *    HR shipped already has an `hr` row, saying off. Skipping rows that
     *    exist leaves it off forever, and the module stays invisible however
     *    many times this runs. That is the bug this script was written to fix,
     *    surviving inside the script itself.
     *
     *    Turning it on here is safe because nothing can switch a module off:
     *    the seed and this script are the only writers, and there is no
     *    interface for it. When one is built, the tenant's choice has to be
     *    recorded on the row — a `disabledAt`, or a flag saying a human set
     *    this — and this step must then leave a deliberate off alone. Until
     *    then, `false` on an implemented module means nothing but "written
     *    before the module existed".
     */
    const moduleFlags = new Map(
      (
        await rawDb.organisationModule.findMany({
          where: { organisationId: organisation.id },
          select: { moduleKey: true, isEnabled: true },
        })
      ).map((row) => [row.moduleKey, row.isEnabled]),
    );

    for (const moduleKey of Object.values(MODULES)) {
      const isEnabled = moduleFlags.get(moduleKey);

      if (isEnabled === undefined) {
        await rawDb.organisationModule.create({
          data: {
            organisationId: organisation.id,
            moduleKey,
            isEnabled: IMPLEMENTED.has(moduleKey),
          },
        });
        added.moduleFlags += 1;
        continue;
      }

      // An unimplemented module stays off. An implemented one that is already
      // on needs no write.
      if (isEnabled || !IMPLEMENTED.has(moduleKey)) continue;

      await rawDb.organisationModule.updateMany({
        where: { organisationId: organisation.id, moduleKey },
        data: { isEnabled: true },
      });
      added.modulesEnabled += 1;
      console.log(`Enabled ${moduleKey} for ${organisation.name}.`);
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
