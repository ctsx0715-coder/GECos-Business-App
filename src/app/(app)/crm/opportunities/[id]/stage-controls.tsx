"use client";

import { useState, useTransition } from "react";
import { advanceStage, closeOpportunity, logActivity } from "../../actions";

const OPEN_STAGES = ["QUALIFIED", "PROPOSAL", "NEGOTIATION"] as const;

/**
 * Stage and close controls.
 *
 * The loss-reason box is required by the service, not just by this form — a
 * pipeline whose losses are unexplained teaches nobody anything, and that rule
 * has to survive someone calling the action directly.
 */
export function StageControls({
  opportunityId,
  stage,
  canEdit,
  canClose,
}: {
  opportunityId: string;
  stage: string;
  canEdit: boolean;
  canClose: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [showLost, setShowLost] = useState(false);

  const closed = stage === "WON" || stage === "LOST";

  function act(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.message ?? "That did not work.");
      else setShowLost(false);
    });
  }

  if (closed) {
    return (
      <p className="text-xs text-muted">
        This deal is closed. Reopen it to make further changes.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Stage
          </p>
          <div className="flex flex-wrap gap-1">
            {OPEN_STAGES.map((option) => (
              <button
                key={option}
                type="button"
                disabled={pending || option === stage}
                onClick={() => act(() => advanceStage(opportunityId, option))}
                className={`rounded-lg px-3 py-1.5 text-sm transition disabled:opacity-60 ${
                  option === stage
                    ? "bg-accent text-accent-foreground"
                    : "border border-border hover:bg-surface-muted"
                }`}
              >
                {option.charAt(0) + option.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {canClose && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Close
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => closeOpportunity(opportunityId, "WON"))}
              className="rounded-lg bg-success px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Mark won
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowLost((v) => !v)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-danger transition hover:bg-danger-soft disabled:opacity-50"
            >
              Mark lost
            </button>
          </div>

          {showLost && (
            <div className="mt-2 flex gap-2">
              <input
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
                placeholder="Why was it lost?"
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  act(() => closeOpportunity(opportunityId, "LOST", lostReason))
                }
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-danger transition hover:bg-danger-soft disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Quick note logger on the opportunity timeline. */
export function LogNote({ opportunityId }: { opportunityId: string }) {
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<"CALL" | "EMAIL" | "MEETING" | "NOTE">("NOTE");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="border-t border-border px-5 py-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(event) => setType(event.target.value as typeof type)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="NOTE">Note</option>
          <option value="CALL">Call</option>
          <option value="EMAIL">Email</option>
          <option value="MEETING">Meeting</option>
        </select>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="What happened?"
          className="min-w-40 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={pending || subject.trim().length < 2}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await logActivity({
                entityType: "OPPORTUNITY",
                entityId: opportunityId,
                type,
                subject,
              });
              if (!result.ok) setError(result.message ?? "Could not log that.");
              else setSubject("");
            });
          }}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          Log
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
