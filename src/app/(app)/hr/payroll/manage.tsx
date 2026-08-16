"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormAction } from "@/components/forms";
import { updatePayrollPolicyAction } from "../actions";

/**
 * The period being paid, and the rules for splitting it.
 *
 * The period is two dates rather than a "month" picker: a pay period is a
 * fortnight on some sites and a month in the office, and both are ordinary
 * here rather than one being a special case.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export function PeriodPicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
          From
        </span>
        <input
          type="date"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
          To
        </span>
        <input
          type="date"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          className={inputClass}
        />
      </label>
      <button
        type="button"
        disabled={pending || !start || !end || end < start}
        onClick={() =>
          startTransition(() =>
            router.push(`/hr/payroll?from=${start}&to=${end}`),
          )
        }
        className="h-9 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-50"
      >
        Show
      </button>
      <a
        href={`/api/payroll?from=${from}&to=${to}`}
        className="inline-flex h-9 items-center rounded-[10px] border border-accent bg-accent px-3 text-sm font-medium text-accent-foreground transition hover:opacity-90"
      >
        Download CSV
      </a>
    </div>
  );
}

interface PolicyValues {
  ordinaryMinutesPerDayShortWeek: number;
  ordinaryMinutesPerDayLongWeek: number;
  ordinaryMinutesPerWeek: number;
  maxOvertimeMinutesPerDay: number;
  maxOvertimeMinutesPerWeek: number;
  overtimeMultiplier: number;
  sundayMultiplier: number;
  holidayMultiplier: number;
}

/** Minutes are what the timesheet measures in; hours are what people say. */
function HoursField({
  label,
  minutes,
  onChange,
  hint,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
        {label}
      </span>
      <input
        value={String(Math.round((minutes / 60) * 100) / 100)}
        inputMode="decimal"
        onChange={(event) => {
          const hours = Number(event.target.value.replace(/[^\d.]/g, "")) || 0;
          onChange(Math.round(hours * 60));
        }}
        className={inputClass}
      />
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

function RateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
        {label}
      </span>
      <input
        value={String(value)}
        inputMode="decimal"
        onChange={(event) =>
          onChange(Number(event.target.value.replace(/[^\d.]/g, "")) || 0)
        }
        className={inputClass}
      />
    </label>
  );
}

export function PolicyEditor({ policy }: { policy: PolicyValues }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(policy);
  const set = <K extends keyof PolicyValues>(key: K, value: PolicyValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const { pending, message, submit } = useFormAction(() => setOpen(false));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-accent hover:underline"
      >
        Edit the rules
      </button>
    );
  }

  return (
    <div className="space-y-3 border-t border-border p-5">
      <div className="grid gap-2 sm:grid-cols-3">
        <HoursField
          label="Ordinary day — five-day week"
          minutes={values.ordinaryMinutesPerDayShortWeek}
          onChange={(minutes) => set("ordinaryMinutesPerDayShortWeek", minutes)}
          hint="BCEA: 9 hours"
        />
        <HoursField
          label="Ordinary day — six-day week"
          minutes={values.ordinaryMinutesPerDayLongWeek}
          onChange={(minutes) => set("ordinaryMinutesPerDayLongWeek", minutes)}
          hint="BCEA: 8 hours"
        />
        <HoursField
          label="Ordinary week"
          minutes={values.ordinaryMinutesPerWeek}
          onChange={(minutes) => set("ordinaryMinutesPerWeek", minutes)}
          hint="BCEA: 45 hours"
        />
        <HoursField
          label="Most overtime in a day"
          minutes={values.maxOvertimeMinutesPerDay}
          onChange={(minutes) => set("maxOvertimeMinutesPerDay", minutes)}
          hint="BCEA: 3 hours. Reported, not enforced"
        />
        <HoursField
          label="Most overtime in a week"
          minutes={values.maxOvertimeMinutesPerWeek}
          onChange={(minutes) => set("maxOvertimeMinutesPerWeek", minutes)}
          hint="BCEA: 10 hours"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <RateField
          label="Overtime ×"
          value={values.overtimeMultiplier}
          onChange={(value) => set("overtimeMultiplier", value)}
        />
        <RateField
          label="Sunday ×"
          value={values.sundayMultiplier}
          onChange={(value) => set("sundayMultiplier", value)}
        />
        <RateField
          label="Public holiday ×"
          value={values.holidayMultiplier}
          onChange={(value) => set("holidayMultiplier", value)}
        />
      </div>

      <p className="text-xs text-muted">
        The multipliers are carried into the export for the payroll package to
        apply. Nothing here knows what anybody earns.
      </p>

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(() => updatePayrollPolicyAction({ ...values }))}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save the rules"}
        </button>
        <button
          type="button"
          onClick={() => {
            setValues(policy);
            setOpen(false);
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
