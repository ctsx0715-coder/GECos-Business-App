import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { db, rawDb } from "@/lib/database/client";
import {
  requireRequestContext,
  withRequestContext,
  withSystemContext,
} from "@/lib/database/tenant-context";

/**
 * Tenant isolation, soft delete and audit, proven against a real Postgres.
 *
 * These deliberately query with the *wrong* tenant context rather than just
 * asserting the happy path, because the failure mode that matters is one
 * client seeing another's tender pricing (acceptance criteria, 01-demo-scope).
 */

async function freshOrganisations() {
  await rawDb.$executeRawUnsafe("TRUNCATE organisations CASCADE");
  const nopedi = await rawDb.organisation.create({ data: { name: "Nopedi" } });
  const rival = await rawDb.organisation.create({ data: { name: "Rival Co" } });
  return { nopedi, rival };
}

let nopediId: string;
let rivalId: string;

beforeEach(async () => {
  const { nopedi, rival } = await freshOrganisations();
  nopediId = nopedi.id;
  rivalId = rival.id;
});

afterAll(async () => {
  await rawDb.$disconnect();
});

/**
 * organisationId is passed explicitly because Prisma's generated types require
 * it. The extension verifies it against the bound context rather than trusting
 * it, so a mismatch throws — see "refuses a create aimed at another tenant".
 */
function makeTender(reference: string, title: string) {
  const { organisationId } = requireRequestContext();
  return db.tender.create({
    data: { organisationId, reference, title, closingAt: new Date("2026-09-01") },
  });
}

describe("tenant isolation", () => {
  it("hides another tenant's records from list queries", async () => {
    await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0001", "Water reticulation"),
    );
    await withSystemContext(rivalId, () =>
      makeTender("TN-2026-0001", "Rival bid"),
    );

    const nopediSees = await withSystemContext(nopediId, () =>
      db.tender.findMany(),
    );
    const rivalSees = await withSystemContext(rivalId, () =>
      db.tender.findMany(),
    );

    expect(nopediSees.map((t) => t.title)).toEqual(["Water reticulation"]);
    expect(rivalSees.map((t) => t.title)).toEqual(["Rival bid"]);
  });

  it("returns null when reading another tenant's record by its id", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0002", "Confidential pricing"),
    );

    const leaked = await withSystemContext(rivalId, () =>
      db.tender.findUnique({ where: { id: tender.id } }),
    );

    expect(leaked).toBeNull();
  });

  it("throws rather than leaking on findUniqueOrThrow across tenants", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0003", "Confidential pricing"),
    );

    await expect(
      withSystemContext(rivalId, () =>
        db.tender.findUniqueOrThrow({ where: { id: tender.id } }),
      ),
    ).rejects.toThrow();
  });

  it("refuses to update another tenant's record", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0004", "Original title"),
    );

    await expect(
      withSystemContext(rivalId, () =>
        db.tender.update({
          where: { id: tender.id },
          data: { title: "Hijacked" },
        }),
      ),
    ).rejects.toThrow();

    const unchanged = await rawDb.tender.findUnique({
      where: { id: tender.id },
    });
    expect(unchanged?.title).toBe("Original title");
  });

  it("refuses to delete another tenant's record", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0005", "Not yours"),
    );

    await expect(
      withSystemContext(rivalId, () =>
        db.tender.delete({ where: { id: tender.id } }),
      ),
    ).rejects.toThrow();

    const stillLive = await rawDb.tender.findUnique({
      where: { id: tender.id },
    });
    expect(stillLive?.deletedAt).toBeNull();
  });

  it("scopes updateMany to the acting tenant", async () => {
    await withSystemContext(nopediId, () => makeTender("TN-1", "Nopedi"));
    await withSystemContext(rivalId, () => makeTender("TN-1", "Rival"));

    await withSystemContext(nopediId, () =>
      db.tender.updateMany({ data: { industry: "Construction" } }),
    );

    const rivalTender = await withSystemContext(rivalId, () =>
      db.tender.findFirst(),
    );
    expect(rivalTender?.industry).toBeNull();
  });

  it("still returns the record when findUnique selects narrow fields", async () => {
    // Regression: the tenant is verified on the returned row, so a select that
    // omitted organisationId used to compare against undefined and discard a
    // valid record. Every findUnique with a narrow select returned null.
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0200", "Narrow select"),
    );

    const found = await withSystemContext(nopediId, () =>
      db.tender.findUnique({
        where: { id: tender.id },
        select: { id: true, title: true },
      }),
    );

    expect(found).toEqual({ id: tender.id, title: "Narrow select" });
    expect(found).not.toHaveProperty("organisationId");
    expect(found).not.toHaveProperty("deletedAt");
  });

  it("still blocks cross-tenant reads when findUnique selects narrow fields", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0201", "Narrow select"),
    );

    const leaked = await withSystemContext(rivalId, () =>
      db.tender.findUnique({
        where: { id: tender.id },
        select: { id: true, title: true },
      }),
    );

    expect(leaked).toBeNull();
  });

  it("hides soft-deleted records from a narrow-select findUnique", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0202", "Deleted"),
    );
    await withSystemContext(nopediId, () =>
      db.tender.delete({ where: { id: tender.id } }),
    );

    const found = await withSystemContext(nopediId, () =>
      db.tender.findUnique({
        where: { id: tender.id },
        select: { id: true, title: true },
      }),
    );

    expect(found).toBeNull();
  });

  it("refuses a create aimed at a tenant other than the bound one", async () => {
    await expect(
      withSystemContext(nopediId, () =>
        db.tender.create({
          data: {
            organisationId: rivalId,
            reference: "TN-2026-9999",
            title: "Planted in the wrong tenant",
            closingAt: new Date("2026-09-01"),
          },
        }),
      ),
    ).rejects.toThrow(/Refusing to create Tender/);

    const rivalRows = await rawDb.tender.findMany({
      where: { organisationId: rivalId },
    });
    expect(rivalRows).toEqual([]);
  });

  it("supplies organisationId when the caller omits it", async () => {
    // Cast because Prisma's types require the column; the extension is what
    // actually fills it in, and this proves the runtime path independently.
    const data = {
      reference: "TN-2026-0100",
      title: "Injected tenant",
      closingAt: new Date("2026-09-01"),
    } as unknown as Prisma.TenderUncheckedCreateInput;

    const tender = await withSystemContext(nopediId, () =>
      db.tender.create({ data }),
    );

    expect(tender.organisationId).toBe(nopediId);
  });

  it("refuses any tenant-scoped query with no context bound", async () => {
    await expect(db.tender.findMany()).rejects.toThrow(
      /No request context bound/,
    );
  });

  it("rejects an upsert that does not pin the tenant", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0006", "Existing"),
    );

    await expect(
      withSystemContext(rivalId, () =>
        db.tender.upsert({
          where: { id: tender.id },
          create: {
            organisationId: rivalId,
            reference: "TN-X",
            title: "Sneaky",
            closingAt: new Date(),
          },
          update: { title: "Hijacked" },
        }),
      ),
    ).rejects.toThrow(/must pin organisationId/);
  });

  it("allows an upsert whose compound unique includes the tenant", async () => {
    const year = 2026;
    await withSystemContext(nopediId, () =>
      db.referenceSequence.upsert({
        where: {
          organisationId_prefix_year: {
            organisationId: nopediId,
            prefix: "TN",
            year,
          },
        },
        create: {
          organisationId: nopediId,
          prefix: "TN",
          year,
          lastNumber: 1,
        },
        update: { lastNumber: { increment: 1 } },
      }),
    );

    const sequence = await withSystemContext(nopediId, () =>
      db.referenceSequence.findFirst({ where: { prefix: "TN", year } }),
    );
    expect(sequence?.lastNumber).toBe(1);
  });
});

describe("soft delete", () => {
  it("keeps the row but hides it from reads", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0007", "To be deleted"),
    );

    await withSystemContext(nopediId, () =>
      db.tender.delete({ where: { id: tender.id } }),
    );

    const visible = await withSystemContext(nopediId, () => db.tender.findMany());
    expect(visible).toEqual([]);

    const row = await rawDb.tender.findUnique({ where: { id: tender.id } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.recordStatus).toBe("DELETED");
  });

  it("hides soft-deleted records from findUnique too", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0008", "Gone"),
    );
    await withSystemContext(nopediId, () =>
      db.tender.delete({ where: { id: tender.id } }),
    );

    const found = await withSystemContext(nopediId, () =>
      db.tender.findUnique({ where: { id: tender.id } }),
    );
    expect(found).toBeNull();
  });

  it("can still reach deleted records when asked explicitly", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0009", "Archived"),
    );
    await withSystemContext(nopediId, () =>
      db.tender.delete({ where: { id: tender.id } }),
    );

    const found = await withSystemContext(nopediId, () =>
      db.tender.findMany({ where: { deletedAt: { not: null } } }),
    );
    expect(found.map((t) => t.title)).toEqual(["Archived"]);
  });
});

describe("audit trail", () => {
  it("records the full life of a record without being asked", async () => {
    const tender = await withSystemContext(nopediId, () =>
      makeTender("TN-2026-0010", "Audited tender"),
    );
    await withSystemContext(nopediId, () =>
      db.tender.update({
        where: { id: tender.id },
        data: { title: "Renamed tender", status: "IN_PROGRESS" },
      }),
    );
    await withSystemContext(nopediId, () =>
      db.tender.delete({ where: { id: tender.id } }),
    );

    const trail = await rawDb.auditLog.findMany({
      where: { entityType: "Tender", entityId: tender.id },
      orderBy: { createdAt: "asc" },
    });

    expect(trail.map((row) => row.action)).toEqual([
      "CREATE",
      "UPDATE",
      "DELETE",
    ]);

    const update = trail[1].changes as Record<
      string,
      { from: unknown; to: unknown }
    >;
    expect(update.title).toEqual({
      from: "Audited tender",
      to: "Renamed tender",
    });
    expect(update.status).toEqual({ from: "IDENTIFIED", to: "IN_PROGRESS" });
  });

  it("attributes the action to the acting user", async () => {
    const user = await withSystemContext(nopediId, () =>
      db.user.create({
        data: {
          organisationId: nopediId,
          email: "thato@nopedi.co.za",
          firstName: "T",
          lastName: "C",
        },
      }),
    );

    const tender = await withRequestContext(
      { organisationId: nopediId, userId: user.id },
      () => makeTender("TN-2026-0011", "Attributed"),
    );

    const [row] = await rawDb.auditLog.findMany({
      where: { entityType: "Tender", entityId: tender.id },
    });
    expect(row.actorUserId).toBe(user.id);

    const created = await rawDb.tender.findUnique({ where: { id: tender.id } });
    expect(created?.createdBy).toBe(user.id);
  });

  it("does not audit its own writes", async () => {
    await withSystemContext(nopediId, () => makeTender("TN-2026-0012", "One"));
    const auditOfAudit = await rawDb.auditLog.findMany({
      where: { entityType: "AuditLog" },
    });
    expect(auditOfAudit).toEqual([]);
  });

  it("writes an audit row per record for bulk updates", async () => {
    await withSystemContext(nopediId, () => makeTender("TN-A", "A"));
    await withSystemContext(nopediId, () => makeTender("TN-B", "B"));

    await withSystemContext(nopediId, () =>
      db.tender.updateMany({ data: { industry: "Mining" } }),
    );

    const updates = await rawDb.auditLog.findMany({
      where: { entityType: "Tender", action: "UPDATE" },
    });
    expect(updates).toHaveLength(2);
  });
});
