"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { runAccrualAction } from "../../actions";

/**
 * Run accrual now.
 *
 * The schedule is the real mechanism; this button exists because a schedule is
 * impossible to demonstrate on a Tuesday, and because the run is idempotent —
 * it credits the periods between the last run and today, so pressing it twice
 * is a no-op rather than a double payment.
 */
export function RunAccrual() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <span className="flex items-center gap-2">
      {message && (
        <span
          className={`text-xs ${failed ? "font-medium text-danger" : "text-muted"}`}
        >
          {message}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await runAccrualAction();
            setFailed(!result.ok);
            setMessage(result.message ?? (result.ok ? "Done." : "That failed."));
            if (result.ok) router.refresh();
          })
        }
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-50"
      >
        <Icon name="history" size={16} />
        {pending ? "Running…" : "Run accrual"}
      </button>
    </span>
  );
}
