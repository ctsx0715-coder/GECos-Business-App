"use client";

import { useState } from "react";
import { useFormAction } from "@/components/forms";
import { describePattern } from "@/modules/hr/work-patterns";
import { createWorkPatternAction, updateWorkPatternAction } from "../actions";

/**
 * Picking working days.
 *
 * A row of toggles rather than a list of checkboxes with labels, because the
 * thing being chosen is a shape — "Monday to Saturday" is recognised at a
 * glance and a list of ticked boxes is not. Longer cycles get the same row,
 * wrapped, with the week number alongside so a fortnight reads as two weeks
 * rather than fourteen anonymous squares.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

function DayToggles({
  cycleDays,
  selected,
  onToggle,
}: {
  cycleDays: number;
  selected: number[];
  onToggle: (index: number) => void;
}) {
  const weeks: number[][] = [];
  for (let index = 0; index < cycleDays; index += 1) {
    const week = Math.floor(index / 7);
    weeks[week] ??= [];
    weeks[week].push(index);
  }

  return (
    <div className="space-y-1.5">
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="flex items-center gap-1.5">
          {cycleDays > 7 && (
            <span className="w-14 shrink-0 text-[11px] text-faint">
              Week {weekIndex + 1}
            </span>
          )}
          {week.map((index) => {
            const on = selected.includes(index);
            return (
              <button
                key={index}
                type="button"
                onClick={() => onToggle(index)}
                aria-pressed={on}
                className={`size-8 rounded-lg border text-xs font-medium transition ${
                  on
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-faint hover:bg-surface-muted"
                }`}
              >
                {DAY_INITIALS[index % 7]}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface PatternValues {
  id?: string;
  code: string;
  name: string;
  description: string;
  cycleDays: number;
  workingDayIndexes: number[];
  hoursPerDay: number;
  isDefault: boolean;
  isActive: boolean;
}

function PatternFields({
  values,
  set,
  editing,
}: {
  values: PatternValues;
  set: <K extends keyof PatternValues>(key: K, value: PatternValues[K]) => void;
  editing: boolean;
}) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        {!editing && (
          <input
            value={values.code}
            onChange={(event) => set("code", event.target.value.toUpperCase())}
            placeholder="Code, e.g. SITE_6DAY"
            className={inputClass}
          />
        )}
        <input
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="Name, e.g. Site — six-day week"
          className={inputClass}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Cycle length in days
          </span>
          <select
            value={values.cycleDays}
            onChange={(event) => {
              const cycleDays = Number(event.target.value);
              set("cycleDays", cycleDays);
              // Days beyond the new cycle would be invisible and still counted.
              set(
                "workingDayIndexes",
                values.workingDayIndexes.filter((index) => index < cycleDays),
              );
            }}
            className={inputClass}
          >
            <option value={7}>7 — an ordinary week</option>
            <option value={14}>14 — a fortnightly rotation</option>
            <option value={21}>21 — a three-week rotation</option>
            <option value={28}>28 — a four-week rotation</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Hours a day
          </span>
          <input
            value={String(values.hoursPerDay)}
            inputMode="decimal"
            onChange={(event) =>
              set("hoursPerDay", Number(event.target.value.replace(/[^\d.]/g, "")) || 0)
            }
            className={inputClass}
          />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-faint">
          Days worked
        </span>
        <DayToggles
          cycleDays={values.cycleDays}
          selected={values.workingDayIndexes}
          onToggle={(index) =>
            set(
              "workingDayIndexes",
              values.workingDayIndexes.includes(index)
                ? values.workingDayIndexes.filter((day) => day !== index)
                : [...values.workingDayIndexes, index].sort((a, b) => a - b),
            )
          }
        />
        <p className="mt-1.5 text-xs text-muted">
          {values.workingDayIndexes.length === 0
            ? "Somebody has to work at least one day."
            : describePattern({
                cycleDays: values.cycleDays,
                workingDayIndexes: values.workingDayIndexes,
                anchorOn: new Date(),
              })}
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.isDefault}
            onChange={(event) => set("isDefault", event.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Default for anyone without a pattern
        </label>
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(event) => set("isActive", event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Available to assign
          </label>
        )}
      </div>
    </>
  );
}

const BLANK: PatternValues = {
  code: "",
  name: "",
  description: "",
  cycleDays: 7,
  workingDayIndexes: [0, 1, 2, 3, 4],
  hoursPerDay: 8,
  isDefault: false,
  isActive: true,
};

export function NewWorkPattern() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(BLANK);
  const set = <K extends keyof PatternValues>(key: K, value: PatternValues[K]) =>
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
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-accent bg-accent px-3 text-sm font-medium text-accent-foreground transition hover:opacity-90"
      >
        New pattern
      </button>
    );
  }

  return (
    <div className="w-full max-w-lg space-y-2 rounded-[14px] border border-border bg-surface p-4">
      <PatternFields values={values} set={set} editing={false} />

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !values.code || values.name.trim().length < 2}
          onClick={() => submit(() => createWorkPatternAction({ ...values }))}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Create pattern"}
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

export function WorkPatternEditor({ pattern }: { pattern: PatternValues }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(pattern);
  const set = <K extends keyof PatternValues>(key: K, value: PatternValues[K]) =>
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
      <PatternFields values={values} set={set} editing />

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || values.workingDayIndexes.length === 0}
          onClick={() =>
            submit(() =>
              updateWorkPatternAction({
                workPatternId: pattern.id,
                name: values.name,
                description: values.description || undefined,
                cycleDays: values.cycleDays,
                workingDayIndexes: values.workingDayIndexes,
                hoursPerDay: values.hoursPerDay,
                isDefault: values.isDefault,
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
            setValues(pattern);
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
