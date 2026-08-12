"use client";

import { useState, useTransition } from "react";
import { convertLead, disqualifyLead, qualifyLead } from "../actions";

interface CustomerOption {
  id: string;
  name: string;
}

/**
 * Lead actions: qualify, disqualify, convert.
 *
 * The conversion form defaults to creating a customer from the lead's own
 * company name, but offers the existing customer list first — because the
 * commonest way a CRM accumulates duplicate clients is a form that makes
 * creating one easier than finding one.
 */
export function LeadActions({
  leadId,
  companyName,
  status,
  customers,
  canConvert,
}: {
  leadId: string;
  companyName: string;
  status: string;
  customers: CustomerOption[];
  canConvert: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [customerId, setCustomerId] = useState("");
  const [title, setTitle] = useState(`${companyName} opportunity`);
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);

  function act(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.message ?? "That did not work.");
      else {
        setOpen(false);
        setShowReason(false);
      }
    });
  }

  if (status === "CONVERTED" || status === "DISQUALIFIED") return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "QUALIFIED" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => qualifyLead(leadId))}
            className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted disabled:opacity-50"
          >
            Qualify
          </button>
        )}

        {canConvert && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            Convert
          </button>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => setShowReason((v) => !v)}
          className="text-xs text-muted hover:underline"
        >
          Disqualify
        </button>
      </div>

      {showReason && (
        <div className="flex gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this not worth pursuing?"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => disqualifyLead(leadId, reason))}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-danger transition hover:bg-danger-soft disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      )}

      {open && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "existing"}
                onChange={() => setMode("existing")}
                className="accent-[var(--accent)]"
              />
              Existing customer
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "new"}
                onChange={() => setMode("new")}
                className="accent-[var(--accent)]"
              />
              Create &ldquo;{companyName}&rdquo;
            </label>
          </div>

          {mode === "existing" && (
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="">Choose a customer…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          )}

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Opportunity title"
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                act(() =>
                  convertLead({
                    leadId,
                    opportunityTitle: title,
                    ...(mode === "existing"
                      ? { customerId }
                      : { newCustomerName: companyName }),
                  }),
                )
              }
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Converting…" : "Create opportunity"}
            </button>
            <p className="text-xs text-muted">
              Value, owner, source and call history carry across.
            </p>
          </div>
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
