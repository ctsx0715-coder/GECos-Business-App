import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTOR_STAMPED_MODELS,
  RECORD_STATUS_MODELS,
  SOFT_DELETE_MODELS,
  TENANT_SCOPED_MODELS,
  UNSCOPED_MODELS,
} from "./model-metadata";

/**
 * The safety net behind model-metadata.ts.
 *
 * The extension's behaviour is driven by hand-maintained sets, which would
 * silently miss a model added later. This test reads the schema and fails if
 * the declarations and the schema disagree in either direction — a model that
 * has organisationId but is not scoped, or one declared scoped that does not.
 *
 * That is the mechanism ADR-007 relies on: a module written six months from
 * now cannot quietly opt out of tenancy, soft delete or audit.
 */

interface ParsedModel {
  name: string;
  fields: Set<string>;
}

function parseSchema(): ParsedModel[] {
  const source = readFileSync(
    resolve(__dirname, "../../../prisma/schema.prisma"),
    "utf8",
  );

  const models: ParsedModel[] = [];
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

  let match: RegExpExecArray | null;
  while ((match = modelPattern.exec(source)) !== null) {
    const [, name, body] = match;
    const fields = new Set<string>();
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const fieldMatch = /^(\w+)\s+\S/.exec(line);
      if (fieldMatch) fields.add(fieldMatch[1]);
    }
    models.push({ name, fields });
  }
  return models;
}

const models = parseSchema();

describe("model metadata matches the Prisma schema", () => {
  it("finds the models", () => {
    expect(models.length).toBeGreaterThan(15);
  });

  it("every model is either tenant scoped or explicitly excused", () => {
    const unregistered = models
      .map((m) => m.name)
      .filter((n) => !TENANT_SCOPED_MODELS.has(n) && !UNSCOPED_MODELS.has(n));

    expect(
      unregistered,
      "Add these to TENANT_SCOPED_MODELS, or to UNSCOPED_MODELS with a reason",
    ).toEqual([]);
  });

  it.each(models)("$name scoping matches its organisationId column", (model) => {
    const hasColumn = model.fields.has("organisationId");
    const declared = TENANT_SCOPED_MODELS.has(model.name);
    expect(
      declared,
      hasColumn
        ? `${model.name} has organisationId but is not in TENANT_SCOPED_MODELS`
        : `${model.name} has no organisationId but is in TENANT_SCOPED_MODELS`,
    ).toBe(hasColumn);
  });

  it.each(models)("$name soft delete matches its deletedAt column", (model) => {
    expect(SOFT_DELETE_MODELS.has(model.name)).toBe(
      model.fields.has("deletedAt"),
    );
  });

  it.each(models)("$name recordStatus declaration matches", (model) => {
    expect(RECORD_STATUS_MODELS.has(model.name)).toBe(
      model.fields.has("recordStatus"),
    );
  });

  it.each(models)("$name actor stamping matches its createdBy column", (model) => {
    expect(ACTOR_STAMPED_MODELS.has(model.name)).toBe(
      model.fields.has("createdBy") && model.fields.has("updatedBy"),
    );
  });

  it("audit_logs is append only", () => {
    const auditLog = models.find((m) => m.name === "AuditLog");
    expect(auditLog).toBeDefined();
    expect(
      auditLog!.fields.has("deletedAt"),
      "AuditLog must not be soft-deletable — the trail is the record",
    ).toBe(false);
    expect(auditLog!.fields.has("updatedAt")).toBe(false);
  });
});
