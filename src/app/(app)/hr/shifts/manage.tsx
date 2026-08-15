"use client";

import { useState } from "react";
import { useFormAction } from "@/components/forms";
import {
  crossesMidnight,
  formatMinutes,
  parseMinutes,
  workedHours,
} from "@/modules/hr/shifts";
import { createShiftAction, updateShiftAction } from "../actions";

/**
 * Configuring a shift.
 *
 * Two time fields and a break, with the hours it is worth computed as you
 * type. A night shift is entered exactly like a day shift — 18:00 to 06:00 —
 * and the form says "crosses midnight" rather than refusing it, because that
 * is a normal shift on a site and not a mistake.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

interface ShiftValues {
  id?: string;
  code: string;
  name: string;
  description: string;
  startsAtMinutes: number;
  endsAtMinutes: number;
  breakMinutes: number;
  sortOrder: number;
  isActive: boolean;
}

const BLANK: ShiftValues = {
  code: "",
  name: "",
  description: "",
  startsAtMinutes: 7 * 60,
  endsAtMinutes: 16 * 60,
  breakMinutes: 60,
  sortOrder: 0,
  isActive: true,
};

function TimeField({
  label,
  minutes,
  onChange,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  // Kept as text so a half-typed "1" does not jump to 01:00 mid-keystroke.
  const [text, setText] = useState(formatMinutes(minutes));

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
        {label}
      </span>
      <input
        type="time"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parseMinutes(event.target.value);
          if (parsed !== null) onChange(parsed);
        }}
        className={inputClass}
      />
    </label>
  );
}

function ShiftFields({
  values,
  set,
  editing,
}: {
  values: ShiftValues;
  set: <K extends keyof ShiftValues>(key: K, value: ShiftValues[K]) => void;
  editing: boolean;
}) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        {!editing && (
          <input
            value={values.code}
            onChange={(event) => set("code", event.target.value.toUpperCase())}
            placeholder="Code, e.g. NIGHT"
            className={inputClass}
          />
        )}
        <input
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="Name, e.g. Night shift"
          className={inputClass}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <TimeField
          label="Starts"
          minutes={values.startsAtMinutes}
          onChange={(minutes) => set("startsAtMinutes", minutes)}
        />
        <TimeField
          label="Ends"
          minutes={values.endsAtMinutes}
          onChange={(minutes) => set("endsAtMinutes", minutes)}
        />
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Unpaid break, minutes
          </span>
          <input
            value={String(values.breakMinutes)}
            inputMode="numeric"
            onChange={(event) =>
              set("breakMinutes", Number(event.target.value.replace(/\D/g, "")) || 0)
            }
            className={inputClass}
          />
        </label>
      </div>

      <p className="px-1 text-xs text-muted">
        Worth <span className="tabular font-medium">{workedHours(values)}</span>{" "}
        paid hours
        {crossesMidnight(values) && " · crosses midnight, ending the next morning"}
      </p>

      {editing && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Available to attach to patterns
        </label>
      )}
    </>
  );
}

export function NewShift() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(BLANK);
  const set = <K extends keyof ShiftValues>(key: K, value: ShiftValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setValues(BLANK);
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-[10px] border border-accent bg-accent px-3 text-sm font-medium text-accent-foreground transition hover:opacity-90"
      >
        New shift
      </button>
    );
  }

  return (
    <div className="w-full max-w-lg space-y-2 rounded-[14px] border border-border bg-surface p-4">
      <ShiftFields values={values} set={set} editing={false} />

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !values.code || values.name.trim().length < 2}
          onClick={() => submit(() => createShiftAction({ ...values }))}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Create shift"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ShiftEditor({ shift }: { shift: ShiftValues }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(shift);
  const set = <K extends keyof ShiftValues>(key: K, value: ShiftValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const { pending, message, submit } = useFormAction(() => setOpen(false));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs font-medium text-accent hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-[10px] border border-border bg-surface-muted p-3">
      <ShiftFields values={values} set={set} editing />

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            submit(() =>
              updateShiftAction({
                shiftId: shift.id,
                name: values.name,
                description: values.description || undefined,
                startsAtMinutes: values.startsAtMinutes,
                endsAtMinutes: values.endsAtMinutes,
                breakMinutes: values.breakMinutes,
                sortOrder: values.sortOrder,
                isActive: values.isActive,
              }),
            )
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setValues(shift);
            setOpen(false);
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
