import "dotenv/config";
import { rawDb } from "@/lib/database/client";
import { withSystemContext } from "@/lib/database/tenant-context";
import { seedProcurementDemo } from "../prisma/procurement-demo";
import { ensureLogins, findNopedi, refuseWithoutDemoFlag } from "./demo-logins";

/**
 * Gives procurement a body of data on a database that is already live.
 *
 * Same job as `hr:backfill` and `hse:backfill`, and the same reasoning: the
 * seed builds a demonstration from nothing and truncates every table to do it,
 * which is the right tool for a fresh database and the wrong one for a
 * deployment seeded before this module existed. This writes the same dataset
 * the seed writes — prisma/procurement-demo.ts, the same file — and destroys
 * nothing.
 *
 * It depends on the HR backfill having run first, because deliveries are
 * signed for by employees looked up by name, and on the main seed for the
 * sites orders are raised against. Neither is an error if missing; the
 * demonstration is simply thinner than it should be.
 *
 * Run against the demonstration database only. Guarded on NOPEDI_DEMO_DATA.
 */

/** The one login the module needs and no earlier seed created. */
const BUYER = {
  firstName: "Naledi",
  lastName: "Dlamini",
  jobTitle: "Buyer",
  roleKey: "buyer",
};

async function main() {
  refuseWithoutDemoFlag("suppliers, purchase orders, deliveries and invoices");

  const nopedi = await findNopedi();

  await withSystemContext(nopedi.id, async () => {
    const userIds = await ensureLogins(nopedi.id, [BUYER]);
    const summary = await seedProcurementDemo({
      organisationId: nopedi.id,
      userIds,
    });

    const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
    if (total === 0) {
      console.log(`${nopedi.name}: procurement data already present, nothing added.`);
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
