import { db } from "@/lib/database/client";
import { requireRequestContext } from "@/lib/database/tenant-context";

/**
 * Human-facing reference numbers such as TN-2026-0041.
 *
 * Separate from the uuid primary key on purpose: people quote these on the
 * phone and write them on paper, so they need to be short, sequential and
 * scoped per organisation per year.
 *
 * The counter is incremented with an upsert on a compound unique that includes
 * organisationId, which is the form the tenancy extension permits. The
 * increment is atomic at the database, so two concurrent tenders cannot take
 * the same number.
 */
export async function nextReference(prefix: string): Promise<string> {
  const { organisationId } = requireRequestContext();
  const year = new Date().getUTCFullYear();

  const sequence = await db.referenceSequence.upsert({
    where: {
      organisationId_prefix_year: { organisationId, prefix, year },
    },
    create: { organisationId, prefix, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });

  return `${prefix}-${year}-${String(sequence.lastNumber).padStart(4, "0")}`;
}
