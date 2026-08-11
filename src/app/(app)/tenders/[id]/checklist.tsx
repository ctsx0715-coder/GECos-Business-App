"use client";

import { useState, useTransition } from "react";
import { submitForApproval, toggleRequirement } from "../actions";
import { Badge } from "@/components/ui";

interface RequirementRow {
  id: string;
  label: string;
  isMandatory: boolean;
  satisfiedAt: Date | string | null;
}

/**
 * The submission checklist.
 *
 * The submit button disables itself while mandatory items are outstanding, but
 * that is only a courtesy — pressing it anyway is rejected by the service, and
 * the error shown here is the service's own message listing what is missing.
 */
export function Checklist({
  tenderId,
  requirements,
  canEdit,
  canSubmit,
  alreadySubmitted,
}: {
  tenderId: string;
  requirements: RequirementRow[];
  canEdit: boolean;
  canSubmit: boolean;
  alreadySubmitted: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  const mandatory = requirements.filter((r) => r.isMandatory);
  const outstanding = mandatory.filter((r) => !r.satisfiedAt);
  const satisfied = requirements.filter((r) => r.satisfiedAt).length;

  function onToggle(requirementId: string, next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await toggleRequirement(tenderId, requirementId, next);
      if (!result.ok) setError(result.message ?? "Could not update that item.");
    });
  }

  function onSubmit() {
    setError(null);
    setMissing([]);
    startTransition(async () => {
      const result = await submitForApproval(tenderId);
      if (!result.ok) {
        setError(result.message ?? "Could not submit this tender.");
        const detail = result.details?.missingMandatory;
        if (Array.isArray(detail)) setMissing(detail as string[]);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Submission checklist
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {satisfied} of {requirements.length} complete
            {outstanding.length > 0 &&
              ` · ${outstanding.length} mandatory outstanding`}
          </p>
        </div>
        <Badge tone={outstanding.length === 0 ? "success" : "warning"}>
          {outstanding.length === 0 ? "Ready to submit" : "Incomplete"}
        </Badge>
      </div>

      <ul className="divide-y divide-border">
        {requirements.map((requirement) => {
          const done = Boolean(requirement.satisfiedAt);
          return (
            <li
              key={requirement.id}
              className="flex items-center gap-3 px-5 py-2.5"
            >
              <input
                type="checkbox"
                checked={done}
                disabled={!canEdit || pending || alreadySubmitted}
                onChange={(event) =>
                  onToggle(requirement.id, event.target.checked)
                }
                className="size-4 shrink-0 accent-[var(--accent)]"
                aria-label={requirement.label}
              />
              <span
                className={`flex-1 text-sm ${done ? "text-muted line-through" : ""}`}
              >
                {requirement.label}
              </span>
              {requirement.isMandatory ? (
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  Mandatory
                </span>
              ) : (
                <span className="text-[11px] uppercase tracking-wide text-muted opacity-60">
                  Optional
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <div className="mx-5 mb-4 rounded-lg bg-danger-soft px-4 py-3">
          <p className="text-sm font-medium text-danger">{error}</p>
          {missing.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-danger">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canSubmit && !alreadySubmitted && (
        <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
          <p className="text-xs text-muted">
            {outstanding.length === 0
              ? "All mandatory items are in place."
              : "The server will reject this until every mandatory item is satisfied."}
          </p>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      )}
    </div>
  );
}
