"use client";

import { useState } from "react";
import { useFormAction } from "@/components/forms";
import { decideSupplierAction } from "../actions";

/**
 * Clearing a supplier, or stopping one.
 *
 * Suspending asks for a reason and clearing does not, which is deliberate:
 * the next person to try to raise an order against a suspended supplier will
 * be told they cannot, and "why" needs to already be on the record by then.
 */

export function SupplierDecision({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: string;
}) {
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, message, submit } = useFormAction(() => {
    setSuspending(false);
    setReason("");
  });

  if (suspending) {
    return (
      <div className="flex flex-col gap-1.5">
        <input
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={`Why is ${name} being suspended?`}
          className="w-56 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || reason.trim().length === 0}
            onClick={() =>
              submit(() =>
                decideSupplierAction({ id, status: "SUSPENDED", reason }),
              )
            }
            className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
          >
            {pending ? "Saving…" : "Suspend"}
          </button>
          <button
            type="button"
            onClick={() => setSuspending(false)}
            className="text-xs text-muted hover:underline"
          >
            Cancel
          </button>
        </div>
        {message && <p className="text-xs text-danger">{message}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {status !== "APPROVED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(() => decideSupplierAction({ id, status: "APPROVED" }))}
          className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
        >
          Clear
        </button>
      )}
      {status !== "SUSPENDED" && (
        <button
          type="button"
          onClick={() => setSuspending(true)}
          className="text-xs text-muted hover:underline"
        >
          Suspend
        </button>
      )}
      {message && <span className="text-xs text-danger">{message}</span>}
    </div>
  );
}
