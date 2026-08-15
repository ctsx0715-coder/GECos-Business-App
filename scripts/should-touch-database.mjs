/**
 * Whether this build is allowed to write to the database.
 *
 * Preview deployments share the production database, and both a preview build
 * and a production build run migrations. When the same commit lands on two
 * branches they build concurrently, race for Prisma's advisory lock, and one
 * fails with P1002 — a build that looks broken while nothing is wrong.
 *
 * The deeper problem is that a preview build has no business migrating the
 * database production is serving from. Schema changes belong to the production
 * deploy. So previews read the schema, they do not change it.
 *
 * Shared by the migration step and the configuration sync deliberately: two
 * copies of this rule would eventually disagree, and the failure mode of them
 * disagreeing is a preview build writing to production.
 */

export function shouldTouchDatabase() {
  if (!process.env.DATABASE_URL) {
    return { ok: false, reason: "no-database" };
  }

  const environment = process.env.VERCEL_ENV;

  // Not on Vercel at all — a developer's machine, or CI. Their database.
  if (!environment) return { ok: true, reason: "local" };

  if (environment === "production") return { ok: true, reason: "production" };

  /*
   * The escape hatch, for the day previews get a database of their own. Set
   * it in the Vercel project's preview environment and previews migrate that
   * database instead of skipping.
   */
  if (process.env.NOPEDI_MIGRATE_ON_PREVIEW === "true") {
    return { ok: true, reason: "preview-opt-in" };
  }

  return { ok: false, reason: "preview" };
}

/** The message that explains a skip, so a quiet build is never a mystery. */
export function skipMessage(reason) {
  if (reason === "no-database") {
    return [
      "",
      "  DATABASE_URL is not set — skipping migrations and configuration sync.",
      "",
      "  The build will succeed, but the deployed app cannot serve requests",
      "  until you add DATABASE_URL to the Vercel project's environment",
      "  variables and redeploy. Use the Neon *pooled* connection string, and",
      "  set the function region to match the database region.",
      "",
    ].join("\n");
  }

  return [
    "",
    `  Preview deployment (VERCEL_ENV=${process.env.VERCEL_ENV}) — skipping`,
    "  migrations and configuration sync.",
    "",
    "  Previews share the production database, so writing to it from here",
    "  would race the production deploy for Prisma's advisory lock and change",
    "  the schema production is serving from. The production deploy owns both.",
    "",
    "  If previews ever get their own database, set NOPEDI_MIGRATE_ON_PREVIEW",
    "  to true in the preview environment.",
    "",
  ].join("\n");
}
