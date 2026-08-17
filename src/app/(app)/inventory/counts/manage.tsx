"use client";

import { useState } from "react";
import { useFormAction } from "@/components/forms";
import { startCountAction } from "../actions";

/**
 * Starting a stocktake.
 *
 * A store and a date, and nothing else. Everything that makes a count worth
 * doing happens on the count's own screen, and asking for any of it up front
 * is asking somebody to fill in a form before they have walked the racks.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

const linkClass =
  "text-xs font-medium text-accent hover:underline disabled:opacity-50";

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export function StartCountInline({
  stores,
  employees,
}: {
  stores: Array<{ value: string; label: string }>;
  employees: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [stockLocationId, setStockLocationId] = useState(stores[0]?.value ?? "");
  const [countedOn, setCountedOn] = useState(today());
  const [countedByEmployeeId, setCountedByEmployeeId] = useState("");

  const { pending, message, submit } = useFormAction(() => setOpen(false));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={linkClass}
        disabled={stores.length === 0}
      >
        Count a store
      </button>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Which store
          </span>
          <select
            value={stockLocationId}
            onChange={(event) => setStockLocationId(event.target.value)}
            className={inputClass}
          >
            {stores.map((store) => (
              <option key={store.value} value={store.value}>
                {store.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Counted on
          </span>
          <input
            type="date"
            value={countedOn}
            onChange={(event) => setCountedOn(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Counted by
          </span>
          <select
            value={countedByEmployeeId}
            onChange={(event) => setCountedByEmployeeId(event.target.value)}
            className={inputClass}
          >
            <option value="">Nobody named</option>
            {employees.map((employee) => (
              <option key={employee.value} value={employee.value}>
                {employee.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message && <p className="text-xs font-medium text-danger">{message}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !stockLocationId}
          onClick={() =>
            submit(() =>
              startCountAction({
                stockLocationId,
                countedOn,
                countedByEmployeeId: countedByEmployeeId || null,
              }),
            )
          }
          className={linkClass}
        >
          {pending ? "Starting…" : "Start counting"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
