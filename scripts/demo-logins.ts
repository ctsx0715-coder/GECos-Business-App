import { db, rawDb } from "@/lib/database/client";
import { SYSTEM_ROLES } from "@/lib/permissions";

/**
 * Existing logins by role, and the ones a module shipped after the fact needs.
 *
 * Every backfill hits the same problem. The demonstration database was seeded
 * before the module existed, so nobody holds its role, so the dataset has
 * nobody to attribute anything to — a safety register whose incidents were
 * investigated by `undefined` demonstrates nothing.
 *
 * `db:sync` deliberately will not fix this: it holds the line that users are
 * not configuration, and it is right. So the demo-data scripts create the one
 * or two logins their module needs, and say so in their output. They are
 * demo-data scripts and their names say so.
 */

export interface DemoPerson {
  firstName: string;
  lastName: string;
  jobTitle: string;
  roleKey: string;
}

/**
 * Maps role key to user id for everybody who already has a login, then creates
 * any of `people` whose role nobody holds yet.
 */
export async function ensureLogins(
  organisationId: string,
  people: DemoPerson[],
): Promise<Record<string, string>> {
  const users = await db.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      roles: { select: { role: { select: { key: true } } } },
    },
  });

  const userIds: Record<string, string> = {};
  for (const user of users) {
    for (const link of user.roles) {
      // First user found for a role wins; the demo has one of each.
      userIds[link.role.key] ??= user.id;
    }
  }

  for (const person of people) {
    if (userIds[person.roleKey]) continue;

    const role = await db.role.findFirst({
      where: { key: person.roleKey },
      select: { id: true },
    });
    if (!role) {
      // db:sync writes the system roles on every production deploy, so this is
      // a deploy that has not happened rather than a state to work around.
      throw new Error(
        `The ${SYSTEM_ROLES[person.roleKey]?.name ?? person.roleKey} role does not exist yet. ` +
          "Deploy first — db:sync creates it — then run this again.",
      );
    }

    // Somebody may already exist by name without holding the role, which is
    // what happens when two modules want the same person.
    const existing = await db.user.findFirst({
      where: { firstName: person.firstName, lastName: person.lastName },
      select: { id: true },
    });

    const user =
      existing ??
      (await db.user.create({
        data: {
          organisationId,
          email: `${person.firstName.toLowerCase()}@nopedi.co.za`,
          firstName: person.firstName,
          lastName: person.lastName,
          jobTitle: person.jobTitle,
        },
        select: { id: true },
      }));

    await rawDb.userRole.createMany({
      data: [{ userId: user.id, roleId: role.id }],
      skipDuplicates: true,
    });

    console.log(
      `Created the ${person.jobTitle} login: ${person.firstName} ${person.lastName}.`,
    );
    userIds[person.roleKey] = user.id;
  }

  return userIds;
}

/**
 * The Nopedi tenant, which is the only one a demo dataset may be written into.
 *
 * Writing Nopedi's staff or Nopedi's incident register into every organisation
 * would put the same people on two payrolls and make the tenant isolation
 * demonstration meaningless.
 */
export async function findNopedi(): Promise<{ id: string; name: string }> {
  const organisations = await rawDb.organisation.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const nopedi = organisations.find((organisation) =>
    organisation.name.toLowerCase().includes("nopedi"),
  );

  if (!nopedi) {
    throw new Error(
      `No Nopedi tenant found. Organisations present: ${
        organisations.map((organisation) => organisation.name).join(", ") || "none"
      }`,
    );
  }

  return nopedi;
}

/** The guard every demo-data script shares. */
export function refuseWithoutDemoFlag(whatItInvents: string): void {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  if (process.env.NOPEDI_DEMO_DATA !== "true") {
    console.error(
      [
        "",
        `  Refusing to write demonstration data into this database.`,
        "",
        `  This script invents ${whatItInvents}. That is fine on a demo`,
        "  database and unacceptable on one holding real records, so it will",
        "  only run with NOPEDI_DEMO_DATA=true.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
}
