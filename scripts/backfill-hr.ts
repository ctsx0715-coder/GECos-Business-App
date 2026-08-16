import "dotenv/config";
import { rawDb } from "@/lib/database/client";
import { withSystemContext } from "@/lib/database/tenant-context";
import { seedHrDemo } from "../prisma/hr-demo";
import { ensureLogins, findNopedi, refuseWithoutDemoFlag } from "./demo-logins";

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
  refuseWithoutDemoFlag("employees, certifications and a login");

  /*
   * The dataset is Nopedi's staff by name, so it goes into Nopedi's tenant and
   * nowhere else. Writing it into every organisation would put the same eleven
   * people on two payrolls and make the tenant isolation demo meaningless.
   */
  const nopedi = await findNopedi();

  await withSystemContext(nopedi.id, async () => {
    const userIds = await ensureLogins(nopedi.id, [HR_MANAGER]);
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

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => rawDb.$disconnect());
