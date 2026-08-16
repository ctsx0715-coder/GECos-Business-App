#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  shouldTouchDatabase,
  skipMessage,
  whyItDecided,
} from "./should-touch-database.mjs";

/**
 * Applies pending migrations before a deploy, when this build is the one that
 * owns the database.
 *
 * Two reasons to skip, both of which are a warning rather than a failure. No
 * DATABASE_URL means the environment variable has not been added yet, and the
 * application build itself has no need of a database — failing here is a
 * confusing way to learn about a missing variable. A preview deployment means
 * the database belongs to production, and migrating it from here races the
 * production deploy for Prisma's advisory lock.
 *
 * A URL that is set but broken, on a build that should be migrating, is a
 * different matter and still fails the build, loudly, because that is a real
 * misconfiguration.
 */

const { ok, reason } = shouldTouchDatabase();
console.log(whyItDecided({ ok, reason }));

if (!ok) {
  console.warn(skipMessage(reason));
  process.exit(0);
}

const result = spawnSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
