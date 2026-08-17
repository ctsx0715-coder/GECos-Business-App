"use client";

import { useState } from "react";
import { useFormAction } from "@/components/forms";
import {
  adjustStockAction,
  issueStockAction,
  returnStockAction,
  transferStockAction,
} from "../../actions";

/**
 * The things somebody does to stock.
 *
 * Each is a small form that opens where the decision is made rather than on a
 * page of its own, because every one of them is done with something in the
 * other hand — a requisition slip, a delivery note, a clipboard — and a round
 * trip to a separate screen is a round trip away from the paper.
 *
 * Which of them appear is decided on the server and passed in. A storeman
 * never sees the write-off form, and could not use it if he typed the URL: the
 * service refuses it either way.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

const linkClass =
  "text-xs font-medium text-accent hover:underline disabled:opacity-50";

/** Today in the browser's own clock, for a `date` input. */
function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

interface Option {
  value: string;
  label: string;
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------

/**
 * Issuing material out.
 *
 * The store defaults to wherever most of it is, because that is where a
 * storeman is standing. Everything stays editable, and nothing here refuses a
 * quantity larger than the store holds — the material is leaving whatever this
 * screen says, and the service records it rather than losing it.
 */
export function IssueStock({
  stockItemId,
  unit,
  stores,
  projects,
  employees,
}: {
  stockItemId: string;
  unit: string;
  stores: Option[];
  projects: Option[];
  employees: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [fromLocationId, setFromLocationId] = useState(stores[0]?.value ?? "");
  const [quantity, setQuantity] = useState("");
  const [movedAt, setMovedAt] = useState(today());
  const [projectId, setProjectId] = useState("");
  const [issuedToEmployeeId, setIssuedToEmployeeId] = useState("");
  const [note, setNote] = useState("");

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setQuantity("");
    setNote("");
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        Issue out
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 pt-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Labelled label="Out of">
          <Select
            value={fromLocationId}
            onChange={setFromLocationId}
            options={stores}
            placeholder="Which store"
          />
        </Labelled>
        <Labelled label={`Quantity (${unit})`}>
          <input
            inputMode="decimal"
            value={quantity}
            onChange={(event) =>
              setQuantity(event.target.value.replace(/[^\d.]/g, ""))
            }
            className={inputClass}
            placeholder="0"
          />
        </Labelled>
        <Labelled label="On">
          <input
            type="date"
            value={movedAt}
            onChange={(event) => setMovedAt(event.target.value)}
            className={inputClass}
          />
        </Labelled>
        <Labelled label="For which job">
          <Select
            value={projectId}
            onChange={setProjectId}
            options={projects}
            placeholder="None — yard or office"
          />
        </Labelled>
        <Labelled label="Issued to">
          <Select
            value={issuedToEmployeeId}
            onChange={setIssuedToEmployeeId}
            options={employees}
            placeholder="Nobody named"
          />
        </Labelled>
        <Labelled label="Note">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={inputClass}
          />
        </Labelled>
      </div>

      {message && <p className="text-xs font-medium text-danger">{message}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !fromLocationId || !quantity}
          onClick={() =>
            submit(() =>
              issueStockAction({
                stockItemId,
                fromLocationId,
                quantity: Number(quantity),
                movedAt,
                projectId: projectId || null,
                issuedToEmployeeId: issuedToEmployeeId || null,
                note: note || undefined,
              }),
            )
          }
          className={linkClass}
        >
          {pending ? "Saving…" : "Record the issue"}
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

/** Material coming back off a site unused. */
export function ReturnStock({
  stockItemId,
  unit,
  stores,
  projects,
}: {
  stockItemId: string;
  unit: string;
  stores: Option[];
  projects: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [toLocationId, setToLocationId] = useState(stores[0]?.value ?? "");
  const [quantity, setQuantity] = useState("");
  const [movedAt, setMovedAt] = useState(today());
  const [projectId, setProjectId] = useState("");

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setQuantity("");
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        Take a return
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 pt-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Labelled label="Back into">
          <Select
            value={toLocationId}
            onChange={setToLocationId}
            options={stores}
            placeholder="Which store"
          />
        </Labelled>
        <Labelled label={`Quantity (${unit})`}>
          <input
            inputMode="decimal"
            value={quantity}
            onChange={(event) =>
              setQuantity(event.target.value.replace(/[^\d.]/g, ""))
            }
            className={inputClass}
            placeholder="0"
          />
        </Labelled>
        <Labelled label="On">
          <input
            type="date"
            value={movedAt}
            onChange={(event) => setMovedAt(event.target.value)}
            className={inputClass}
          />
        </Labelled>
        <Labelled label="Back from">
          <Select
            value={projectId}
            onChange={setProjectId}
            options={projects}
            placeholder="No job"
          />
        </Labelled>
      </div>

      {message && <p className="text-xs font-medium text-danger">{message}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !toLocationId || !quantity}
          onClick={() =>
            submit(() =>
              returnStockAction({
                stockItemId,
                toLocationId,
                quantity: Number(quantity),
                movedAt,
                projectId: projectId || null,
              }),
            )
          }
          className={linkClass}
        >
          {pending ? "Saving…" : "Record the return"}
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

/** Between our own stores. Refused by the service if the source is short. */
export function TransferStock({
  stockItemId,
  unit,
  stores,
}: {
  stockItemId: string;
  unit: string;
  stores: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [movedAt, setMovedAt] = useState(today());

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setQuantity("");
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        Move between stores
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 pt-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Labelled label="Out of">
          <Select
            value={fromLocationId}
            onChange={setFromLocationId}
            options={stores}
            placeholder="Which store"
          />
        </Labelled>
        <Labelled label="Into">
          <Select
            value={toLocationId}
            onChange={setToLocationId}
            options={stores.filter((store) => store.value !== fromLocationId)}
            placeholder="Which store"
          />
        </Labelled>
        <Labelled label={`Quantity (${unit})`}>
          <input
            inputMode="decimal"
            value={quantity}
            onChange={(event) =>
              setQuantity(event.target.value.replace(/[^\d.]/g, ""))
            }
            className={inputClass}
            placeholder="0"
          />
        </Labelled>
        <Labelled label="On">
          <input
            type="date"
            value={movedAt}
            onChange={(event) => setMovedAt(event.target.value)}
            className={inputClass}
          />
        </Labelled>
      </div>

      {message && <p className="text-xs font-medium text-danger">{message}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !fromLocationId || !toLocationId || !quantity}
          onClick={() =>
            submit(() =>
              transferStockAction({
                stockItemId,
                fromLocationId,
                toLocationId,
                quantity: Number(quantity),
                movedAt,
              }),
            )
          }
          className={linkClass}
        >
          {pending ? "Saving…" : "Record the transfer"}
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

/**
 * Correcting the ledger, or writing stock off.
 *
 * Only shown to somebody holding the narrow permission, and the reason field
 * has no empty state: an adjustment nobody explained is indistinguishable from
 * somebody making the number say what they wanted it to say, and it is the
 * only record anybody will have of it in a year.
 */
export function AdjustStock({
  stockItemId,
  unit,
  stores,
}: {
  stockItemId: string;
  unit: string;
  stores: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState(stores[0]?.value ?? "");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [quantity, setQuantity] = useState("");
  const [movedAt, setMovedAt] = useState(today());
  const [reason, setReason] = useState("");

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setQuantity("");
    setReason("");
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        Correct or write off
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 pt-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Labelled label="In which store">
          <Select
            value={locationId}
            onChange={setLocationId}
            options={stores}
            placeholder="Which store"
          />
        </Labelled>
        <Labelled label="Which way">
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value as "out" | "in")}
            className={inputClass}
          >
            <option value="out">Take it off — damaged, gone</option>
            <option value="in">Put it on — found, miscounted</option>
          </select>
        </Labelled>
        <Labelled label={`Quantity (${unit})`}>
          <input
            inputMode="decimal"
            value={quantity}
            onChange={(event) =>
              setQuantity(event.target.value.replace(/[^\d.]/g, ""))
            }
            className={inputClass}
            placeholder="0"
          />
        </Labelled>
        <Labelled label="On">
          <input
            type="date"
            value={movedAt}
            onChange={(event) => setMovedAt(event.target.value)}
            className={inputClass}
          />
        </Labelled>
      </div>

      <Labelled label="Why">
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Water damage in the container"
          className={inputClass}
        />
      </Labelled>

      {message && <p className="text-xs font-medium text-danger">{message}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={
            pending || !locationId || !quantity || reason.trim().length < 3
          }
          onClick={() =>
            submit(() =>
              adjustStockAction({
                stockItemId,
                locationId,
                quantity:
                  direction === "out" ? -Number(quantity) : Number(quantity),
                // Taking stock off is a write-off; putting it on is a
                // correction. There is no such thing as writing stock on.
                kind: direction === "out" ? "WRITE_OFF" : "ADJUSTMENT",
                movedAt,
                reason,
              }),
            )
          }
          className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
        >
          {pending ? "Saving…" : "Record it"}
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
