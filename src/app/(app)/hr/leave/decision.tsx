"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icons";
import { decideLeaveAction } from "../actions";

/**
 * Approve / reject controls for a leave request.
 *
 * Separation of duties is not checked here. The buttons are offered to anyone
 * holding the approve permission, and the service refuses if the leave is
 * their own — so the refusal is visible rather than the button being missing,
 * which is what makes the rule discoverable during a demo.
 */
export function LeaveDecision({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);

  function decide(decision: "APPROVED" | "REJECTED") {
    setError(null);
    startTransition(async () => {
      const result = await decideLeaveAction(requestId, decision, comment);
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
          className="rounded-[10px] bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => decide("REJECTED")}
          disabled={pending}
          className="rounded-[10px] border border-border px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-surface-muted disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => setShowComment((open) => !open)}
          className="text-xs text-muted hover:text-foreground"
        >
          {showComment ? "Hide note" : "Add note"}
        </button>
      </div>

      {showComment && (
        <textarea
          value={comment}
          rows={2}
          placeholder="Why, for the record"
          onChange={(event) => setComment(event.target.value)}
          className="w-full rounded-[10px] border border-border bg-surface-muted px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
        />
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <Icon name="alert" size={12} className="mt-0.5" />
          {error}
        </p>
      )}
    </div>
  );
}
