import { db } from "@/lib/database/client";
import { ForbiddenError, UnauthorisedError } from "@/lib/errors";
import { getRequestContext } from "@/lib/database/tenant-context";
import type { PermissionKey } from "./catalogue";

export * from "./catalogue";

/**
 * Server-side permission checks.
 *
 * Called from services, never from components. The UI hides what a user cannot
 * do as a courtesy; this is what actually stops them (ADR-008).
 */

/** Every permission key granted to a user through their roles. */
export async function permissionsForUser(
  userId: string,
): Promise<Set<PermissionKey>> {
  const assignments = await db.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          deletedAt: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });

  const keys = new Set<PermissionKey>();
  for (const assignment of assignments) {
    // UserRole is a join table with no deletedAt of its own, so a soft-deleted
    // role has to be filtered here rather than by the extension.
    if (assignment.role.deletedAt) continue;
    for (const rolePermission of assignment.role.permissions) {
      keys.add(rolePermission.permission.key as PermissionKey);
    }
  }
  return keys;
}

export async function userHasPermission(
  userId: string,
  permission: PermissionKey,
): Promise<boolean> {
  const held = await permissionsForUser(userId);
  return held.has(permission);
}

/**
 * Whether the acting user holds `permission`, without throwing.
 *
 * For the cases where a permission widens what is returned rather than gating
 * it — "your own record, or anyone's if you may see everyone" — where catching
 * a thrown ForbiddenError to decide a branch would be control flow by
 * exception. Gates still use requirePermission.
 */
export async function hasPermission(
  permission: PermissionKey,
): Promise<boolean> {
  const context = getRequestContext();
  if (!context) return false;
  if (context.isSystem && context.userId === null) return true;
  if (!context.userId) return false;
  return userHasPermission(context.userId, permission);
}

/**
 * Asserts the acting user holds `permission`, or throws.
 *
 * Returns the acting user id so callers can use it without re-reading context.
 */
export async function requirePermission(
  permission: PermissionKey,
): Promise<string> {
  const context = getRequestContext();
  if (!context) {
    throw new UnauthorisedError(
      "No request context bound; cannot check permissions.",
    );
  }

  // Background jobs act as the system and bypass role checks. They still write
  // audit rows, with a null actor.
  if (context.isSystem && context.userId === null) {
    return "system";
  }

  if (!context.userId) throw new UnauthorisedError();

  if (!(await userHasPermission(context.userId, permission))) {
    throw new ForbiddenError(
      `Missing permission: ${permission}. Ask an administrator to review your role.`,
    );
  }
  return context.userId;
}

/** True when the tenant has the module switched on (ADR-009). */
export async function moduleEnabled(moduleKey: string): Promise<boolean> {
  const record = await db.organisationModule.findFirst({
    where: { moduleKey },
    select: { isEnabled: true },
  });
  return record?.isEnabled ?? false;
}
