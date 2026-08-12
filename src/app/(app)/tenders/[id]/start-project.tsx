"use client";

import { useState } from "react";
import { useFormAction } from "@/components/forms";
import { createProjectFromTenderAction } from "../../create-actions";

/**
 * The handoff button on a won tender.
 *
 * Only offered once the tender is WON, and the service refuses anyway if it is
 * not — this is the convenient path, not the enforcement.
 */
export function StartProject({
  tenderId,
  existingProjectId,
}: {
  tenderId: string;
  existingProjectId?: string;
}) {
  const [budget, setBudget] = useState("");
  const { pending, message, submit } = useFormAction();

  if (existingProjectId) {
    return (
      <a
        href={`/projects/${existingProjectId}`}
        className="text-sm text-accent hover:underline"
      >
        View the project →
      </a>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">
            R
          </span>
          <input
            value={budget}
            inputMode="decimal"
            onChange={(event) =>
              setBudget(event.target.value.replace(/[^\d.]/g, ""))
            }
            placeholder="Budget"
            className="w-32 rounded-lg border border-border bg-surface py-1.5 pl-6 pr-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            submit(() =>
              createProjectFromTenderAction({
                tenderId,
                budgetRands: budget ? Number(budget) : undefined,
              }),
            )
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Starting…" : "Start project"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Carries the client, the awarded value and a link back to this bid.
      </p>
      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
