import "dotenv/config";
import { rawDb } from "@/lib/database/client";
import { withSystemContext } from "@/lib/database/tenant-context";
import { hrService } from "@/modules/hr/hr.service";

/**
 * Moves people onto the turns that start today.
 *
 * A rotation is decided in advance — the foreman has the crew in front of him
 * this week, and the turn starts on the first of next month. Something has to
 * make that happen on the day, and it cannot be the person who wrote it down
 * three weeks earlier. A schedule runs this every morning
 * (.github/workflows/apply-rotations.yml).
 *
 * Safe to run repeatedly and at any hour: every turn records the moment it
 * took effect, so a second run today moves nobody, and a week of missed runs
 * applies each turn once in the order it was meant to happen.
 *
 * A run GitHub skips is visible rather than silent: the rotation screen shows
 * every turn whose day has come and which has not taken effect, with a button
 * that calls this same service method.
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

  let movedAnybody = false;

  for (const organisation of organisations) {
    const summary = await withSystemContext(organisation.id, () =>
      hrService.applyDueTurnsWithoutPermissionCheck(),
    );

    if (summary.applied.length === 0) {
      console.log(`${organisation.name}: nobody due to rotate.`);
      continue;
    }

    movedAnybody = true;
    console.log(
      `${organisation.name}: moved ${summary.applied.length} onto a new turn — ` +
        `${summary.applied.join(", ")}.`,
    );
  }

  if (!movedAnybody) console.log("Nothing to rotate.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => rawDb.$disconnect());
