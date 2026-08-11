#!/usr/bin/env node
import { spawnSync } from "node:child_process";

/**
 * Applies pending migrations before a deploy, but only when a database is
 * actually configured.
 *
 * Running `prisma migrate deploy` unconditionally makes the build fail with
 * "The datasource.url property is required" on any deploy where DATABASE_URL
 * has not been set yet — which is a confusing way to learn that you forgot an
 * environment variable. The application build itself has no need of a
 * database, so a missing URL is a warning here, not a failure.
 *
 * A URL that is set but broken is a different matter and still fails the
 * build, loudly, because that is a real misconfiguration.
 */

if (!process.env.DATABASE_URL) {
  console.warn(
    [
      "",
      "  DATABASE_URL is not set — skipping migrations.",
      "",
      "  The build will succeed, but the deployed app cannot serve requests",
      "  until you add DATABASE_URL to the Vercel project's environment",
      "  variables and redeploy. Use the Neon *pooled* connection string, and",
      "  set the function region to match the database region.",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const result = spawnSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
