import "dotenv/config";
import { rawDb } from "@/lib/database/client";
import { withSystemContext } from "@/lib/database/tenant-context";
import { hrService } from "@/modules/hr/hr.service";

/**
 * Credits every tenant's leave balances with what they have earned.
 *
 * This is the "automatically" in automatic accrual: a schedule runs it on the
 * first of each month (.github/workflows/accrue-leave.yml) and it credits the
 * months that have completed since the last run. The button on the leave
 * policy screen calls the same service method — there is one engine, and the
 * schedule is simply the caller nobody has to remember.
 *
 * Safe to run at any hour of any day. Each balance records the date it has
 * been credited to, so a second run the same day changes nothing and a run
 * that was missed for a quarter catches all three months up at once.
 *
 * It runs as the system rather than as a person: there is nobody signed in at
 * 02:00 on the first, so it takes the path that skips the permission check and
 * writes audit rows with a null actor.
 */

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const organisations = await rawDb.organisation.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  let creditedAnything = false;

  for (const organisation of organisations) {
    const summary = await withSystemContext(organisation.id, () =>
      hrService.accrueWithoutPermissionCheck(),
    );

    if (summary.daysCredited === 0 && summary.balancesCreated === 0) {
      console.log(`${organisation.name}: already up to date.`);
      continue;
    }

    creditedAnything = true;
    console.log(
      `${organisation.name}: credited ${summary.daysCredited} days across ` +
        `${summary.balancesCredited} balances (${summary.balancesCreated} created).`,
    );
  }

  if (!creditedAnything) console.log("Nothing to credit.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => rawDb.$disconnect());
