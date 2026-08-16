import "dotenv/config";
import { rawDb } from "@/lib/database/client";
import { withSystemContext } from "@/lib/database/tenant-context";
import { seedHseDemo } from "../prisma/hse-demo";
import { ensureLogins, findNopedi, refuseWithoutDemoFlag } from "./demo-logins";

/**
 * Gives the safety register a body of data on a database that is already live.
 *
 * Same job as `hr:backfill` and the same reasoning: the seed builds a
 * demonstration from nothing and truncates every table to do it, which is the
 * right tool for a fresh database and the wrong one for a deployment that was
 * seeded before this module existed. This writes the same dataset the seed
 * writes — prisma/hse-demo.ts, the same file — and destroys nothing.
 *
 * It depends on the HR backfill having run first, because incidents are
 * attributed to employees by name and there is nobody to attribute them to
 * otherwise. Running it against a database with no employees is not an error;
 * it simply leaves the injured-person links empty, which is worse as a
 * demonstration than it looks in a table.
 *
 * Run against the demonstration database only. Guarded on NOPEDI_DEMO_DATA.
 */

/** The one login the module needs and the original seed never created. */
const SAFETY_OFFICER = {
  firstName: "Mandla",
  lastName: "Ngcobo",
  jobTitle: "Safety Officer",
  roleKey: "safety_officer",
};

async function main() {
  refuseWithoutDemoFlag("incidents, corrective actions and a login");

  const nopedi = await findNopedi();

  await withSystemContext(nopedi.id, async () => {
    const userIds = await ensureLogins(nopedi.id, [SAFETY_OFFICER]);
    const summary = await seedHseDemo({ organisationId: nopedi.id, userIds });

    const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
    if (total === 0) {
      console.log(`${nopedi.name}: safety data already present, nothing added.`);
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
