import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  ACTOR_STAMPED_MODELS,
  AUDIT_EXCLUDED_MODELS,
  RECORD_STATUS_MODELS,
  isAudited,
  isSoftDeletable,
  isTenantScoped,
} from "./model-metadata";
import { getRequestContext, requireRequestContext } from "./tenant-context";

/**
 * The single choke point every database write passes through (ADR-007, ADR-001).
 *
 * Three concerns, deliberately in one extension so their ordering is explicit
 * rather than emergent from extension composition:
 *
 *   1. Tenant scoping   — injects organisationId into reads and writes
 *   2. Soft delete      — filters deletedAt, rewrites delete into update
 *   3. Audit            — writes audit_logs rows with before/after diffs
 *
 * Prisma 7 removed `$use()` middleware, so extensions are the only interception
 * point available. Rewrites that need a different operation than the one the
 * caller asked for (delete becoming update) run against the unextended `base`
 * client, and audit rows are written there too so they cannot recurse.
 *
 * Known limitation, deliberately left to fail loudly: nested writes do not get
 * organisationId injected into the nested records. Because organisationId is
 * NOT NULL with no default, such a write fails at the database rather than
 * silently writing an unscoped row. Repositories should create children
 * explicitly instead of nesting them.
 */

const READ_MANY_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const READ_UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
const UPDATE_OPS = new Set(["update", "updateMany", "updateManyAndReturn"]);
const DELETE_OPS = new Set(["delete", "deleteMany"]);

type UnknownRecord = Record<string, unknown>;

/** Converts values Postgres' json column cannot take directly. */
function toJsonValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  /*
   * Decimal before the generic object branch. A Decimal instance carries its
   * own `constructor` property pointing at the class, so walking it with
   * Object.entries puts a function into the audit row and the write fails.
   * Kept as a string for the same reason BigInt is: a float would round the
   * value the audit trail exists to preserve.
   */
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value && typeof value === "object") {
    const out: UnknownRecord = {};
    for (const [k, v] of Object.entries(value as UnknownRecord)) {
      out[k] = toJsonValue(v);
    }
    return out;
  }
  return value;
}

/** Scalars only — relations and functions have no place in an audit row. */
function scalarSnapshot(record: UnknownRecord): UnknownRecord {
  const out: UnknownRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "function") continue;
    // Dates and Decimals are scalar columns despite being objects. Skipping a
    // Decimal would quietly drop the number of days from a leave audit row.
    if (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !(value instanceof Prisma.Decimal)
    ) {
      continue;
    }
    out[key] = toJsonValue(value);
  }
  return out;
}

/** { field: { from, to } } for the fields the write actually changed. */
function diff(
  before: UnknownRecord,
  after: UnknownRecord,
): UnknownRecord | null {
  const changes: UnknownRecord = {};
  for (const key of Object.keys(after)) {
    if (key === "updatedAt") continue;
    const from = before[key];
    const to = after[key];
    const same =
      from instanceof Date && to instanceof Date
        ? from.getTime() === to.getTime()
        : from === to;
    if (!same) {
      changes[key] = { from: toJsonValue(from), to: toJsonValue(to) };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * True when the caller's `where` already pins the tenant.
 *
 * Used for upsert, whose `where` only accepts unique fields, so the tenant
 * cannot simply be injected. Compound uniques that include organisationId
 * (such as ReferenceSequence) satisfy this; anything else is rejected rather
 * than allowed through unscoped.
 */
function whereMentionsOrganisation(
  where: unknown,
  organisationId: string,
): boolean {
  if (!where || typeof where !== "object") return false;
  for (const [key, value] of Object.entries(where as UnknownRecord)) {
    if (key === "organisationId" && value === organisationId) return true;
    if (value && typeof value === "object") {
      if (whereMentionsOrganisation(value, organisationId)) return true;
    }
  }
  return false;
}

export function createTenancyExtension(base: PrismaClient) {
  const delegateFor = (model: string) =>
    (base as unknown as Record<string, UnknownRecord>)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ] as unknown as {
      findUnique: (a: unknown) => Promise<UnknownRecord | null>;
      findMany: (a: unknown) => Promise<UnknownRecord[]>;
      update: (a: unknown) => Promise<UnknownRecord>;
      updateMany: (a: unknown) => Promise<{ count: number }>;
    };

  async function writeAudit(entries: Prisma.AuditLogCreateManyInput[]) {
    if (entries.length === 0) return;
    // Written on the unextended client so audit never audits itself.
    await base.auditLog.createMany({ data: entries });
  }

  return Prisma.defineExtension({
    name: "nopedi-tenancy-soft-delete-audit",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantScoped = isTenantScoped(model);
          const softDeletable = isSoftDeletable(model);

          if (!tenantScoped && !softDeletable) {
            return query(args);
          }

          // Organisation is soft-deletable but not tenant-scoped; it has no
          // organisationId of its own, so only the deletedAt rules apply.
          const context = tenantScoped
            ? requireRequestContext()
            : getRequestContext();
          const organisationId = tenantScoped
            ? requireRequestContext().organisationId
            : undefined;
          const actorId = context?.userId ?? null;

          const a = (args ?? {}) as UnknownRecord;

          // ---------------------------------------------------------------
          // Reads on non-unique filters: scope and hide soft-deleted rows.
          // ---------------------------------------------------------------
          if (READ_MANY_OPS.has(operation)) {
            const where = { ...((a.where as UnknownRecord) ?? {}) };
            if (organisationId) where.organisationId = organisationId;
            // An explicit deletedAt filter means the caller wants deleted rows.
            if (softDeletable && !("deletedAt" in where)) where.deletedAt = null;
            return query({ ...a, where });
          }

          // ---------------------------------------------------------------
          // findUnique cannot take non-unique filters, so the tenant is
          // verified on the way out instead of injected on the way in.
          // ---------------------------------------------------------------
          if (READ_UNIQUE_OPS.has(operation)) {
            // The verification needs organisationId and deletedAt on the
            // returned row. A caller using `select` or `omit` may have left
            // them out, in which case the check would compare against
            // undefined and discard a perfectly valid record. Ask for them,
            // then strip them again so the caller gets what it requested.
            const select = a.select as UnknownRecord | undefined;
            const omit = a.omit as UnknownRecord | undefined;
            const borrowed: string[] = [];

            let nextArgs = args;
            if (select) {
              const nextSelect = { ...select };
              if (organisationId && nextSelect.organisationId === undefined) {
                nextSelect.organisationId = true;
                borrowed.push("organisationId");
              }
              if (softDeletable && nextSelect.deletedAt === undefined) {
                nextSelect.deletedAt = true;
                borrowed.push("deletedAt");
              }
              nextArgs = { ...a, select: nextSelect } as typeof args;
            } else if (omit) {
              const nextOmit = { ...omit };
              if (organisationId && nextOmit.organisationId === true) {
                nextOmit.organisationId = false;
                borrowed.push("organisationId");
              }
              if (softDeletable && nextOmit.deletedAt === true) {
                nextOmit.deletedAt = false;
                borrowed.push("deletedAt");
              }
              nextArgs = { ...a, omit: nextOmit } as typeof args;
            }

            const result = (await query(nextArgs)) as UnknownRecord | null;
            if (!result) return result;

            const wrongTenant =
              organisationId !== undefined &&
              result.organisationId !== organisationId;
            const isDeleted = softDeletable && result.deletedAt != null;
            if (wrongTenant || isDeleted) {
              if (operation === "findUniqueOrThrow") {
                throw new Prisma.PrismaClientKnownRequestError(
                  "No record found",
                  { code: "P2025", clientVersion: Prisma.prismaVersion.client },
                );
              }
              return null;
            }

            if (borrowed.length > 0) {
              const cleaned = { ...result };
              for (const key of borrowed) delete cleaned[key];
              return cleaned;
            }
            return result;
          }

          // ---------------------------------------------------------------
          // Creates: stamp tenant and actor.
          // ---------------------------------------------------------------
          if (CREATE_OPS.has(operation)) {
            const stampOne = (row: UnknownRecord) => {
              const next = { ...row };
              if (organisationId) {
                // Callers may pass organisationId to satisfy Prisma's types.
                // Verify rather than silently override: a mismatch means the
                // caller believes it is writing to a different tenant, which
                // is a bug worth surfacing loudly.
                const supplied = next.organisationId;
                if (supplied !== undefined && supplied !== organisationId) {
                  throw new Error(
                    `Refusing to create ${model} for organisation ${String(supplied)} ` +
                      `while the bound request context is ${organisationId}.`,
                  );
                }
                next.organisationId = organisationId;
              }
              if (model && ACTOR_STAMPED_MODELS.has(model) && actorId) {
                next.createdBy ??= actorId;
                next.updatedBy ??= actorId;
              }
              return next;
            };

            const data = a.data;
            const nextArgs = {
              ...a,
              data: Array.isArray(data)
                ? data.map((row) => stampOne(row as UnknownRecord))
                : stampOne((data as UnknownRecord) ?? {}),
            };

            const result = await query(nextArgs as typeof args);

            if (model && isAudited(model) && organisationId) {
              const rows = Array.isArray(result)
                ? (result as UnknownRecord[])
                : [result as UnknownRecord];
              await writeAudit(
                rows
                  .filter((r) => r && typeof r === "object" && "id" in r)
                  .map((r) => ({
                    organisationId,
                    actorUserId: actorId,
                    action: "CREATE" as const,
                    entityType: model,
                    entityId: String(r.id),
                    changes: scalarSnapshot(r) as Prisma.InputJsonValue,
                    ipAddress: context?.ipAddress,
                    userAgent: context?.userAgent,
                  })),
              );
            }
            return result;
          }

          // ---------------------------------------------------------------
          // Upsert: the tenant cannot be injected into a unique-only where,
          // so require the caller to have pinned it via a compound unique.
          // ---------------------------------------------------------------
          if (operation === "upsert") {
            if (
              organisationId &&
              !whereMentionsOrganisation(a.where, organisationId)
            ) {
              throw new Error(
                `upsert on ${model} must pin organisationId in its where clause. ` +
                  "Use a compound unique that includes organisationId, or do an " +
                  "explicit find-then-create in the repository.",
              );
            }
            const create = { ...((a.create as UnknownRecord) ?? {}) };
            if (organisationId) create.organisationId = organisationId;
            return query({ ...a, create } as typeof args);
          }

          // ---------------------------------------------------------------
          // Updates: scope the where, stamp the actor, audit the diff.
          // ---------------------------------------------------------------
          if (UPDATE_OPS.has(operation)) {
            const data = { ...((a.data as UnknownRecord) ?? {}) };
            if (model && ACTOR_STAMPED_MODELS.has(model) && actorId) {
              data.updatedBy = actorId;
            }

            const audited = Boolean(model && isAudited(model) && organisationId);

            if (operation === "update") {
              // Unique where: verify the tenant by reading the row first.
              const before = audited || organisationId
                ? await delegateFor(model!).findUnique({ where: a.where })
                : null;

              if (organisationId && before && before.organisationId !== organisationId) {
                throw new Prisma.PrismaClientKnownRequestError("No record found", {
                  code: "P2025",
                  clientVersion: Prisma.prismaVersion.client,
                });
              }
              if (softDeletable && before && before.deletedAt != null) {
                throw new Prisma.PrismaClientKnownRequestError("No record found", {
                  code: "P2025",
                  clientVersion: Prisma.prismaVersion.client,
                });
              }

              const result = (await query({ ...a, data })) as UnknownRecord;

              if (audited && before) {
                const changes = diff(before, result);
                if (changes) {
                  await writeAudit([
                    {
                      organisationId: organisationId!,
                      actorUserId: actorId,
                      action: "UPDATE",
                      entityType: model!,
                      entityId: String(result.id),
                      changes: changes as Prisma.InputJsonValue,
                      ipAddress: context?.ipAddress,
                      userAgent: context?.userAgent,
                    },
                  ]);
                }
              }
              return result;
            }

            // updateMany: scope the filter, then audit each affected row.
            const where = { ...((a.where as UnknownRecord) ?? {}) };
            if (organisationId) where.organisationId = organisationId;
            if (softDeletable && !("deletedAt" in where)) where.deletedAt = null;

            const affected = audited
              ? await delegateFor(model!).findMany({ where, select: { id: true } })
              : [];

            const result = await query({ ...a, where, data });

            if (audited && affected.length > 0) {
              const changed = toJsonValue(data) as UnknownRecord;
              await writeAudit(
                affected.map((row) => ({
                  organisationId: organisationId!,
                  actorUserId: actorId,
                  action: "UPDATE" as const,
                  entityType: model!,
                  entityId: String(row.id),
                  changes: { set: changed } as Prisma.InputJsonValue,
                  ipAddress: context?.ipAddress,
                  userAgent: context?.userAgent,
                })),
              );
            }
            return result;
          }

          // ---------------------------------------------------------------
          // Deletes: nothing is hard deleted (ADR-007). Rewritten as updates
          // on the unextended client, since an extension cannot change which
          // operation Prisma runs.
          // ---------------------------------------------------------------
          if (DELETE_OPS.has(operation)) {
            if (!softDeletable) {
              // Join tables and versions are genuinely removable.
              const where = { ...((a.where as UnknownRecord) ?? {}) };
              if (organisationId && operation === "deleteMany") {
                where.organisationId = organisationId;
              }
              return query(operation === "deleteMany" ? { ...a, where } : args);
            }

            const now = new Date();
            const softDeleteData: UnknownRecord = { deletedAt: now };
            if (model && RECORD_STATUS_MODELS.has(model)) {
              softDeleteData.recordStatus = "DELETED";
            }
            if (model && ACTOR_STAMPED_MODELS.has(model) && actorId) {
              softDeleteData.updatedBy = actorId;
            }

            const audited = Boolean(model && isAudited(model) && organisationId);

            if (operation === "delete") {
              const before = await delegateFor(model!).findUnique({
                where: a.where,
              });
              if (
                !before ||
                (organisationId && before.organisationId !== organisationId) ||
                before.deletedAt != null
              ) {
                throw new Prisma.PrismaClientKnownRequestError("No record found", {
                  code: "P2025",
                  clientVersion: Prisma.prismaVersion.client,
                });
              }

              const result = await delegateFor(model!).update({
                where: a.where,
                data: softDeleteData,
              });

              if (audited) {
                await writeAudit([
                  {
                    organisationId: organisationId!,
                    actorUserId: actorId,
                    action: "DELETE",
                    entityType: model!,
                    entityId: String(before.id),
                    changes: scalarSnapshot(before) as Prisma.InputJsonValue,
                    ipAddress: context?.ipAddress,
                    userAgent: context?.userAgent,
                  },
                ]);
              }
              return result;
            }

            const where = { ...((a.where as UnknownRecord) ?? {}) };
            if (organisationId) where.organisationId = organisationId;
            where.deletedAt = null;

            const affected = await delegateFor(model!).findMany({
              where,
              select: { id: true },
            });

            const result = await delegateFor(model!).updateMany({
              where,
              data: softDeleteData,
            });

            if (audited && affected.length > 0) {
              await writeAudit(
                affected.map((row) => ({
                  organisationId: organisationId!,
                  actorUserId: actorId,
                  action: "DELETE" as const,
                  entityType: model!,
                  entityId: String(row.id),
                  changes: Prisma.JsonNull,
                  ipAddress: context?.ipAddress,
                  userAgent: context?.userAgent,
                })),
              );
            }
            return result;
          }

          return query(args);
        },
      },
    },
  });
}

/** Escape hatch for the rare legitimate hard delete, e.g. GDPR/POPIA erasure. */
export const AUDIT_EXCLUDED = AUDIT_EXCLUDED_MODELS;
