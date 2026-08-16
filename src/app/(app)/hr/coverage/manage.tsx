"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormAction } from "@/components/forms";
import { describeRule } from "@/modules/hr/staffing";
import {
  createStaffingRuleAction,
  removeStaffingRuleAction,
  updateStaffingRuleAction,
} from "../actions";

/**
 * Writing down how many people a day needs.
 *
 * Everything that narrows a rule is optional and defaults to "everybody",
 * which is what lets one form express both "the company needs somebody on a
 * Sunday" and "the water works needs four boilermakers on nights". A separate
 * form per shape would be three forms and the same fields.
 */

interface Choice {
  value: string;
  label: string;
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

interface RuleValues {
  id?: string;
  name: string;
  projectId: string;
  department: string;
  shiftId: string;
  weekdays: number[];
  minimumPeople: number;
  /** 0 stands for "no ceiling", which most site rules want. */
  maximumPeople: number;
  isActive: boolean;
}

const BLANK: RuleValues = {
  name: "",
  projectId: "",
  department: "",
  shiftId: "",
  weekdays: [0, 1, 2, 3, 4],
  minimumPeople: 2,
  maximumPeople: 0,
  isActive: true,
};

function RuleFields({
  values,
  set,
  projects,
  shifts,
  departments,
  editing,
}: {
  values: RuleValues;
  set: <K extends keyof RuleValues>(key: K, value: RuleValues[K]) => void;
  projects: Choice[];
  shifts: Choice[];
  departments: string[];
  editing: boolean;
}) {
  return (
    <>
      <input
        value={values.name}
        onChange={(event) => set("name", event.target.value)}
        placeholder="Name, e.g. Water works — day crew"
        className={inputClass}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Site
          </span>
          <select
            value={values.projectId}
            onChange={(event) => set("projectId", event.target.value)}
            className={inputClass}
          >
            <option value="">The whole company</option>
            {projects.map((project) => (
              <option key={project.value} value={project.value}>
                {project.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Department
          </span>
          <select
            value={values.department}
            onChange={(event) => set("department", event.target.value)}
            className={inputClass}
          >
            <option value="">Anybody</option>
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Shift
          </span>
          <select
            value={values.shiftId}
            onChange={(event) => set("shiftId", event.target.value)}
            className={inputClass}
          >
            <option value="">Any hours</option>
            {shifts.map((shift) => (
              <option key={shift.value} value={shift.value}>
                {shift.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Fewest
          </span>
          <input
            value={String(values.minimumPeople)}
            inputMode="numeric"
            onChange={(event) =>
              set("minimumPeople", Number(event.target.value.replace(/\D/g, "")) || 0)
            }
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Most — 0 for no limit
          </span>
          <input
            value={String(values.maximumPeople)}
            inputMode="numeric"
            onChange={(event) =>
              set("maximumPeople", Number(event.target.value.replace(/\D/g, "")) || 0)
            }
            className={inputClass}
          />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-faint">
          Days it applies to
        </span>
        <div className="flex items-center gap-1.5">
          {DAY_INITIALS.map((initial, index) => {
            const on = values.weekdays.includes(index);
            return (
              <button
                key={index}
                type="button"
                aria-pressed={on}
                aria-label={`Day ${index + 1}`}
                onClick={() =>
                  set(
                    "weekdays",
                    on
                      ? values.weekdays.filter((day) => day !== index)
                      : [...values.weekdays, index].sort((a, b) => a - b),
                  )
                }
                className={`size-8 rounded-lg border text-xs font-medium transition ${
                  on
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-faint hover:bg-surface-muted"
                }`}
              >
                {initial}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {describeRule({
            minimumPeople: values.minimumPeople,
            maximumPeople: values.maximumPeople || null,
            weekdays: values.weekdays,
          })}
          . Nobody is counted on a day their own pattern says they are off.
        </p>
      </div>

      {editing && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Watching this rule
        </label>
      )}
    </>
  );
}

function payload(values: RuleValues) {
  return {
    name: values.name,
    projectId: values.projectId || null,
    department: values.department || null,
    shiftId: values.shiftId || null,
    weekdays: values.weekdays,
    minimumPeople: values.minimumPeople,
    // Zero on the form is "no ceiling"; the database says that with null.
    maximumPeople: values.maximumPeople || null,
  };
}

export function NewStaffingRule(props: {
  projects: Choice[];
  shifts: Choice[];
  departments: string[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(BLANK);
  const set = <K extends keyof RuleValues>(key: K, value: RuleValues[K]) =>
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
        New rule
      </button>
    );
  }

  return (
    <div className="w-full max-w-xl space-y-2 rounded-[14px] border border-border bg-surface p-4">
      <RuleFields values={values} set={set} editing={false} {...props} />

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || values.name.trim().length < 2}
          onClick={() => submit(() => createStaffingRuleAction(payload(values)))}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Create rule"}
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

export function StaffingRuleEditor({
  rule,
  projects,
  shifts,
  departments,
}: {
  rule: RuleValues & { id: string };
  projects: Choice[];
  shifts: Choice[];
  departments: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<RuleValues>(rule);
  const set = <K extends keyof RuleValues>(key: K, value: RuleValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const { pending, message, submit } = useFormAction(() => setOpen(false));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-accent hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-[10px] border border-border bg-surface-muted p-3">
      <RuleFields
        values={values}
        set={set}
        editing
        projects={projects}
        shifts={shifts}
        departments={departments}
      />

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
              updateStaffingRuleAction({
                ruleId: rule.id,
                ...payload(values),
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
            setValues(rule);
            setOpen(false);
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            await removeStaffingRuleAction(rule.id);
            router.refresh();
          }}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm text-danger transition hover:bg-danger-soft disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
