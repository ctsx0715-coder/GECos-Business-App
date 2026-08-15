import "dotenv/config";
import { db, rawDb } from "@/lib/database/client";
import { withSystemContext } from "@/lib/database/tenant-context";
import { SYSTEM_ROLES } from "@/lib/permissions";
import { seedHrDemo } from "../prisma/hr-demo";

/**
 * Gives HR a body of data on a database that is already live.
 *
 * The seed builds a demonstration from nothing and truncates every table to do
 * it. That is the right tool for a fresh database and the wrong one for this
 * deployment, which was seeded before the HR module existed: running the seed
 * would produce a complete people register at the cost of every tender, lead
 * and project created since. This writes the same dataset — the same file, in
 * fact, prisma/hr-demo.ts — and destroys nothing.
 *
 * It adds only what is missing, so running it twice is safe and running it
 * after somebody has edited a record leaves the edit alone.
 *
 * Two things it does that the configuration sync deliberately will not:
 *
 *   1. It creates a login. `db:sync` holds the line that users are not
 *      configuration, and it is right — but a demonstration of an HR module
 *      with no HR Manager to sign in as demonstrates very little. This is a
 *      demo-data script, and it says so in its name.
 *   2. It writes tenant data. Same reason, same honesty: this is not a step
 *      that belongs on every deploy, which is why it is run by hand.
 *
 * Run against the demonstration database only. It is guarded on
 * NOPEDI_DEMO_DATA=true for that reason.
 */

/** The person who runs the people register. */
const HR_MANAGER = {
  firstName: "Refilwe",
  lastName: "Molefe",
  jobTitle: "HR Manager",
  roleKey: "hr_manager",
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  if (process.env.NOPEDI_DEMO_DATA !== "true") {
    console.error(
      [
        "",
        "  Refusing to write demonstration people into this database.",
        "",
        "  This script invents employees, certifications and a login. That is",
        "  fine on a demo database and unacceptable on one holding real staff",
        "  records, so it will only run with NOPEDI_DEMO_DATA=true.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const organisations = await rawDb.organisation.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  /*
   * The dataset is Nopedi's staff by name, so it goes into Nopedi's tenant and
   * nowhere else. Writing it into every organisation would put the same eleven
   * people on two payrolls and make the tenant isolation demo meaningless.
   */
  const nopedi = organisations.find((organisation) =>
    organisation.name.toLowerCase().includes("nopedi"),
  );

  if (!nopedi) {
    console.error(
      `No Nopedi tenant found. Organisations present: ${
        organisations.map((organisation) => organisation.name).join(", ") || "none"
      }`,
    );
    process.exit(1);
  }

  await withSystemContext(nopedi.id, async () => {
    const userIds = await ensureLogins(nopedi.id);
    const summary = await seedHrDemo({
      organisationId: nopedi.id,
      userIds,
      decidedById: userIds.hr_manager,
    });

    const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
    if (total === 0) {
      console.log(`${nopedi.name}: HR data already present, nothing added.`);
    } else {
      console.log(`${nopedi.name}: added`, summary);
    }
  });
}

/**
 * Existing logins by role, plus the HR Manager if they are missing.
 *
 * Every other person in the dataset either already has an account from the
 * original seed or is site staff who will never sign in. Only the HR Manager
 * is created here, because the module shipped after the database was built and
 * nobody was ever given the role.
 */
async function ensureLogins(organisationId: string) {
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

  if (userIds[HR_MANAGER.roleKey]) return userIds;

  const role = await db.role.findFirst({
    where: { key: HR_MANAGER.roleKey },
    select: { id: true },
  });
  if (!role) {
    // db:sync writes the system roles on every production deploy, so this is
    // a deploy that has not happened rather than a state to work around.
    throw new Error(
      `The ${SYSTEM_ROLES[HR_MANAGER.roleKey].name} role does not exist yet. ` +
        "Deploy first — db:sync creates it — then run this again.",
    );
  }

  const existing = await db.user.findFirst({
    where: { firstName: HR_MANAGER.firstName, lastName: HR_MANAGER.lastName },
    select: { id: true },
  });

  const user =
    existing ??
    (await db.user.create({
      data: {
        organisationId,
        email: `${HR_MANAGER.firstName.toLowerCase()}@nopedi.co.za`,
        firstName: HR_MANAGER.firstName,
        lastName: HR_MANAGER.lastName,
        jobTitle: HR_MANAGER.jobTitle,
      },
      select: { id: true },
    }));

  await rawDb.userRole.createMany({
    data: [{ userId: user.id, roleId: role.id }],
    skipDuplicates: true,
  });

  console.log(
    `Created the ${HR_MANAGER.jobTitle} login: ${HR_MANAGER.firstName} ${HR_MANAGER.lastName}.`,
  );
  userIds[HR_MANAGER.roleKey] = user.id;
  return userIds;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => rawDb.$disconnect());
