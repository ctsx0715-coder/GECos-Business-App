"use client";

import { useState } from "react";
import { useFormAction } from "@/components/forms";
import {
  abandonCountAction,
  acceptCountAction,
  recordCountLinesAction,
  submitCountAction,
} from "../../actions";

/**
 * Carrying out a count, handing it in, and accepting what it found.
 *
 * The counting form deliberately does not show what the ledger expects. A
 * counter who can see the figure they are supposed to arrive at will arrive at
 * it — not dishonestly, but because forty-two bags and "it says forty" is a
 * recount rather than a variance, and the recount always finds forty. The
 * expected quantity appears once the count has been handed in and it is too
 * late to be influenced by it.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

interface CountableItem {
  id: string;
  name: string;
  unit: string;
  reference: string;
  /** What was written down last time this screen was saved, if anything. */
  counted: string;
}

export function CountTheStore({
  countId,
  items,
}: {
  countId: string;
  items: CountableItem[];
}) {
  const [counted, setCounted] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.counted])),
  );

  const { pending, message, submit } = useFormAction();

  const payload = items
    .filter((item) => counted[item.id] !== "" && counted[item.id] !== undefined)
    .map((item) => ({
      stockItemId: item.id,
      countedQuantity: Number(counted[item.id]),
    }));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-faint">
              <th className="px-5 py-2.5 font-medium">Item</th>
              <th className="px-5 py-2.5 font-medium">Counted in</th>
              <th className="w-40 px-5 py-2.5 font-medium">On the shelf</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-5 py-2.5">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-faint">{item.reference}</div>
                </td>
                <td className="px-5 py-2.5 text-muted">{item.unit}</td>
                <td className="px-5 py-2.5">
                  <input
                    inputMode="decimal"
                    value={counted[item.id] ?? ""}
                    placeholder="Not counted"
                    onChange={(event) =>
                      setCounted((current) => ({
                        ...current,
                        [item.id]: event.target.value.replace(/[^\d.]/g, ""),
                      }))
                    }
                    className={inputClass}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message && <p className="px-5 text-xs font-medium text-danger">{message}</p>}

      <div className="flex items-center gap-3 border-t border-border px-5 py-4">
        <button
          type="button"
          disabled={pending || payload.length === 0}
          onClick={() =>
            submit(() => recordCountLinesAction({ id: countId, lines: payload }))
          }
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save the count"}
        </button>
        <span className="text-xs text-muted">
          {payload.length} of {items.length} counted. Save as often as you like —
          nothing is compared until it is handed in.
        </span>
      </div>
    </div>
  );
}

/** Handing it in. From here the figures are frozen. */
export function HandInCount({ countId }: { countId: string }) {
  const { pending, message, submit } = useFormAction();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => submit(() => submitCountAction({ id: countId }))}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Handing in…" : "Hand it in"}
      </button>
      <span className="text-xs text-muted">
        The variance is fixed at this point, and somebody else has to accept it.
      </span>
      {message && <p className="text-xs font-medium text-danger">{message}</p>}
    </div>
  );
}

/**
 * Accepting the variance.
 *
 * The reason field appears whenever anything is missing, because accepting a
 * count is what writes the shortfall off — and material worth thousands of
 * rand does not evaporate. The service asks for it too; this is the copy of
 * the rule the reader can see.
 */
export function AcceptCount({
  countId,
  shortfall,
}: {
  countId: string;
  shortfall: boolean;
}) {
  const [reason, setReason] = useState("");
  const { pending, message, submit } = useFormAction();

  return (
    <div className="space-y-3">
      {shortfall && (
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            What happened to it
          </span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Six bags split and swept up; site access under review"
            className={inputClass}
          />
        </label>
      )}

      {message && <p className="text-xs font-medium text-danger">{message}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || (shortfall && reason.trim().length === 0)}
          onClick={() =>
            submit(() =>
              acceptCountAction({ id: countId, reason: reason || undefined }),
            )
          }
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Accepting…" : "Accept it into the ledger"}
        </button>
        <span className="text-xs text-muted">
          Every line that disagrees becomes a movement somebody signed.
        </span>
      </div>
    </div>
  );
}

/** Giving up on one. */
export function AbandonCount({ countId }: { countId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, message, submit } = useFormAction(() => setOpen(false));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted hover:underline"
      >
        Give up on it
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        autoFocus
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Rain stopped the count"
        className="w-64 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || reason.trim().length < 3}
          onClick={() => submit(() => abandonCountAction({ id: countId, reason }))}
          className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
        >
          {pending ? "Saving…" : "Abandon it"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:underline"
        >
          Cancel
        </button>
      </div>
      {message && <p className="text-xs text-danger">{message}</p>}
    </div>
  );
}
