import "dotenv/config";
import { rawDb } from "@/lib/database/client";
import { withSystemContext } from "@/lib/database/tenant-context";
import { seedInventoryDemo } from "../prisma/inventory-demo";
import { ensureLogins, findNopedi, refuseWithoutDemoFlag } from "./demo-logins";

/**
 * Gives inventory a body of data on a database that is already live.
 *
 * Same job as the HR, safety and procurement backfills, and the same
 * reasoning: the seed builds a demonstration from nothing and truncates every
 * table to do it, which is the right tool for a fresh database and the wrong
 * one for a deployment seeded before this module existed. This writes the same
 * dataset the seed writes — prisma/inventory-demo.ts, the same file — and
 * destroys nothing.
 *
 * Run it after `procurement:backfill`. It points existing purchase order lines
 * at the stock register and puts their deliveries away, which is the whole
 * hand-off the module is arranged around and cannot be shown against orders
 * that are not there yet. It also depends on the HR backfill for the storeman
 * material was issued to, and on the main seed for the sites it went to.
 * Neither is an error if missing; the demonstration is simply thinner.
 *
 * Run against the demonstration database only. Guarded on NOPEDI_DEMO_DATA.
 */

/** The one login the module needs and no earlier seed created. */
const STOREMAN = {
  firstName: "Thabo",
  lastName: "Maseko",
  jobTitle: "Storeman",
  roleKey: "storeman",
};

async function main() {
  refuseWithoutDemoFlag("stores, stock items, movements and stocktakes");

  const nopedi = await findNopedi();

  await withSystemContext(nopedi.id, async () => {
    const userIds = await ensureLogins(nopedi.id, [STOREMAN]);
    const summary = await seedInventoryDemo({
      organisationId: nopedi.id,
      userIds,
    });

    const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
    if (total === 0) {
      console.log(`${nopedi.name}: inventory data already present, nothing added.`);
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
