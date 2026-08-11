"use client";

import { useState, useTransition } from "react";
import { decideApproval } from "../tenders/actions";

/**
 * Approve / reject controls.
 *
 * Separation of duties is not checked here. The buttons are always offered to
 * anyone holding the approve permission, and the service refuses if the user
 * owns or submitted the tender — so the refusal is visible rather than hidden,
 * which is what makes the rule discoverable during a demo.
 */
export function DecisionButtons({ approvalId }: { approvalId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);

  function decide(decision: "APPROVED" | "REJECTED") {
    setError(null);
    startTransition(async () => {
      const result = await decideApproval(approvalId, decision, comment);
      if (!result.ok) setError(result.message ?? "Could not record that.");
      else setComment("");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => decide("APPROVED")}
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => decide("REJECTED")}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger-soft disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => setShowComment((v) => !v)}
          className="text-xs text-muted hover:underline"
        >
          {showComment ? "Hide comment" : "Add comment"}
        </button>
      </div>

      {showComment && (
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          placeholder="Reason for the decision"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      )}

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
