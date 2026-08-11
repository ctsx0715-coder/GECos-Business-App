import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createTenancyExtension } from "./extensions";

/**
 * The application's database client.
 *
 * Prisma 7 requires a driver adapter for SQL providers. `pg` is used directly
 * so the pool is ours to tune — on Vercel that matters, because the function
 * region and the Neon pooler both sit in the connection path (see the region
 * note in docs/00-architecture-decisions.md).
 *
 * Two clients exist deliberately:
 *
 *   `db`      — extended. Everything in the application uses this.
 *   `rawDb`   — unextended. Migrations, seeds and the audit writer only.
 *
 * Reaching for `rawDb` bypasses tenant scoping, soft delete and audit. If you
 * find yourself importing it outside those three cases, that is the bug.
 */

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env for local development.",
    );
  }
  return url;
}

function createRawClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: connectionString() });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

type ExtendedClient = ReturnType<typeof buildExtendedClient>;

function buildExtendedClient(raw: PrismaClient) {
  return raw.$extends(createTenancyExtension(raw));
}

// Next.js hot reload would otherwise open a new connection pool on every edit.
const globalForPrisma = globalThis as unknown as {
  nopediRawDb?: PrismaClient;
};

export const rawDb: PrismaClient =
  globalForPrisma.nopediRawDb ?? createRawClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.nopediRawDb = rawDb;
}

/**
 * Only the pool is cached across hot reloads, never the extended client.
 *
 * Caching the extension too would pin the old closure in globalThis, so edits
 * to extensions.ts would appear to have no effect until the dev server was
 * restarted — which is a genuinely confusing hour to lose. Rebuilding the
 * wrapper per module instance is cheap; reopening the pool is not.
 */
export const db: ExtendedClient = buildExtendedClient(rawDb);
