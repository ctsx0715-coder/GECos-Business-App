import { withSession } from "@/lib/auth/session";
import { db } from "@/lib/database/client";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

/**
 * The audit trail.
 *
 * Nothing writes to this deliberately — the Prisma extension records every
 * create, update and delete, which is why a module written later cannot forget
 * to be auditable (ADR-007).
 */

function describe(changes: unknown): string | null {
  if (!changes || typeof changes !== "object") return null;
  const record = changes as Record<string, unknown>;
  if ("set" in record) return null;

  const parts: string[] = [];
  for (const [field, value] of Object.entries(record).slice(0, 3)) {
    if (value && typeof value === "object" && "from" in value && "to" in value) {
      const { from, to } = value as { from: unknown; to: unknown };
      parts.push(`${field}: ${String(from ?? "—")} → ${String(to ?? "—")}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

const ACTION_TONES: Record<string, "success" | "warning" | "danger" | "neutral"> =
  {
    CREATE: "success",
    UPDATE: "warning",
    DELETE: "danger",
    APPROVE: "success",
    REJECT: "danger",
  };

export default async function AuditPage() {
  const entries = await withSession(() =>
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { actor: { select: { firstName: true, lastName: true } } },
    }),
  );

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every create, update and delete, written automatically"
      />

      <Card>
        {entries.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description="Actions taken in the system are recorded here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const detail = describe(entry.changes);
              return (
                <li key={entry.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">
                          {entry.actor
                            ? `${entry.actor.firstName} ${entry.actor.lastName}`
                            : "System"}
                        </span>{" "}
                        <Badge tone={ACTION_TONES[entry.action] ?? "neutral"}>
                          {entry.action.toLowerCase()}
                        </Badge>{" "}
                        <span className="text-muted">{entry.entityType}</span>
                      </p>
                      {detail && (
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {detail}
                        </p>
                      )}
                    </div>
                    <time className="shrink-0 text-xs text-muted">
                      {new Intl.DateTimeFormat("en-ZA", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Africa/Johannesburg",
                      }).format(entry.createdAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
