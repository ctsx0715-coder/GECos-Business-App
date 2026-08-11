import { cookies } from "next/headers";
import { db, rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { UnauthorisedError } from "@/lib/errors";
import { permissionsForUser, type PermissionKey } from "@/lib/permissions";

/**
 * Who is making this request.
 *
 * Clerk is not wired in yet (no keys, and MFA is staged to Stage 2), so the
 * development provider below reads a signed-in user from a cookie. Everything
 * above this file goes through `getSession()` and does not care which provider
 * answered, which is the boundary ADR-002 asks for: authentication is the
 * vendor's job, authorisation is ours.
 *
 * Swapping in Clerk means changing `resolveUserId` to read Clerk's session and
 * look up the local user by clerkUserId. No call site changes.
 */

export const DEV_USER_COOKIE = "nopedi_dev_user";

/**
 * Demo authentication: pick a user from a list, no credentials.
 *
 * This is NOT authentication. Anyone who can reach the deployment can sign in
 * as anyone, including the Managing Director. It exists so the role gate and
 * the approval chain can be demonstrated before Clerk is wired in.
 *
 * It works in production builds deliberately — a deployed demo is the whole
 * point — but it is off unless NOPEDI_DEMO_AUTH is explicitly "true", and the
 * app shows a permanent banner whenever it is on, so nobody can mistake the
 * deployment for a secured one.
 *
 * Put Vercel Deployment Protection in front of any deployment running with
 * this enabled, and turn it off the moment Clerk lands.
 */
export function demoAuthEnabled(): boolean {
  return process.env.NOPEDI_DEMO_AUTH === "true";
}

export interface Session {
  userId: string;
  organisationId: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  roleNames: string[];
  permissions: Set<PermissionKey>;
}

async function resolveUserId(): Promise<string | null> {
  if (demoAuthEnabled()) {
    const store = await cookies();
    return store.get(DEV_USER_COOKIE)?.value ?? null;
  }
  // Clerk goes here.
  return null;
}

/** The current session, or null when nobody is signed in. */
export async function getSession(): Promise<Session | null> {
  const userId = await resolveUserId();
  if (!userId) return null;

  // Read on the raw client: resolving who the user is necessarily happens
  // before a tenant context exists to scope the query.
  const user = await rawDb.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
    select: {
      id: true,
      organisationId: true,
      email: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      roles: { select: { role: { select: { name: true, deletedAt: true } } } },
    },
  });
  if (!user) return null;

  const permissions = await withRequestContext(
    { organisationId: user.organisationId, userId: user.id },
    () => permissionsForUser(user.id),
  );

  return {
    userId: user.id,
    organisationId: user.organisationId,
    email: user.email,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    jobTitle: user.jobTitle,
    roleNames: user.roles
      .filter((r) => !r.role.deletedAt)
      .map((r) => r.role.name),
    permissions,
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthorisedError();
  return session;
}

/**
 * Runs `fn` inside the signed-in user's tenant context.
 *
 * Every page and server action that touches data goes through this, so the
 * tenant is bound once at the edge of the request rather than threaded through
 * by hand.
 */
export async function withSession<T>(
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  return withRequestContext(
    { organisationId: session.organisationId, userId: session.userId },
    () => fn(session),
  );
}

/** Users offered by the demo sign-in screen. */
export async function listDevUsers() {
  if (!demoAuthEnabled()) return [];
  return rawDb.user.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ organisation: { name: "asc" } }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      jobTitle: true,
      organisation: { select: { name: true } },
      roles: { select: { role: { select: { name: true } } } },
    },
  });
}

export { db };
