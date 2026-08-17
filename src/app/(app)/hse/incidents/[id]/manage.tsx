"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormAction } from "@/components/forms";
import {
  CONTROL_HINTS,
  CONTROL_LABELS,
  CONTROLS_BY_STRENGTH,
  KIND_HINTS,
  KIND_LABELS,
  KINDS_BY_SEVERITY,
} from "@/modules/hse/vocabulary";
import type { IncidentKind } from "@/modules/hse/reportability";
import type { ControlType } from "@/modules/hse/safety-metrics";
import {
  addActionAction,
  closeIncidentAction,
  completeActionAction,
  investigateIncidentAction,
  recordFilingAction,
} from "../../actions";

/**
 * The things done to an incident after it is reported.
 *
 * All of them are disclosures rather than always-open forms. An incident page
 * is read far more often than it is edited — usually by somebody checking
 * whether a filing went in — and five open forms turn that into scrolling.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

const linkClass = "text-xs font-medium text-accent hover:underline";

/** Today, for the date inputs that default to it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Recording the investigation.
 *
 * The classification is editable here and that is the point rather than an
 * oversight: an incident logged as first aid on Tuesday becomes lost time on
 * Friday when the man does not come back, and it can cross the fourteen-day
 * line weeks after that. The reporting duty is recomputed from these facts
 * every time the page is read, so correcting them corrects the deadlines.
 */
export function Investigate({
  incidentId,
  kind,
  rootCause,
  daysUnableToWork,
  dangerousOccurrence,
}: {
  incidentId: string;
  kind: IncidentKind;
  rootCause: string;
  daysUnableToWork: number | null;
  dangerousOccurrence: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nextKind, setNextKind] = useState<IncidentKind>(kind);
  const [cause, setCause] = useState(rootCause);
  const [days, setDays] = useState(
    daysUnableToWork === null ? "" : String(daysUnableToWork),
  );
  const [dangerous, setDangerous] = useState(dangerousOccurrence);
  const { pending, message, submit } = useFormAction(() => setOpen(false));

  if (!open) {
    return (
      <div className="border-t border-border px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className={linkClass}>
          Record what was found
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border px-5 py-4">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
          Classification
        </span>
        <select
          value={nextKind}
          onChange={(event) => setNextKind(event.target.value as IncidentKind)}
          className={inputClass}
        >
          {KINDS_BY_SEVERITY.map((option) => (
            <option key={option} value={option}>
              {KIND_LABELS[option]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted">
          {KIND_HINTS[nextKind]}
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
          Days off normal work
        </span>
        <input
          value={days}
          inputMode="numeric"
          placeholder="Leave blank while it is not known"
          onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-muted">
          At 14 or more this has to go to the Department of Employment and Labour.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
          Root cause
        </span>
        <textarea
          value={cause}
          rows={3}
          onChange={(event) => setCause(event.target.value)}
          placeholder="Why it was possible, not who did it."
          className={inputClass}
        />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={dangerous}
          onChange={(event) => setDangerous(event.target.checked)}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span>
          A spill, a release under pressure, or machinery that failed or ran out
          of control
          <span className="mt-0.5 block text-xs text-muted">
            Reportable under section 24 whether or not anybody was hurt.
          </span>
        </span>
      </label>

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
              investigateIncidentAction({
                incidentId,
                kind: nextKind,
                rootCause: cause || undefined,
                daysUnableToWork: days === "" ? null : Number(days),
                dangerousOccurrence: dangerous,
              }),
            )
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
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

/**
 * Saying a statutory filing has been made.
 *
 * A claim with legal weight — it is the answer given to an inspector who asks
 * whether the incident was reported — so it is written by a person and never
 * inferred from anything.
 */
export function RecordFiling({
  incidentId,
  to,
  label,
}: {
  incidentId: string;
  to: "DEPARTMENT" | "FUND";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [filedAt, setFiledAt] = useState(today());
  const [reference, setReference] = useState("");
  const { pending, message, submit } = useFormAction(() => setOpen(false));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-2 ${linkClass}`}
      >
        Mark as filed
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs text-muted">Filed with the {label} on</p>
      <input
        type="date"
        value={filedAt}
        onChange={(event) => setFiledAt(event.target.value)}
        className={inputClass}
      />
      <input
        value={reference}
        placeholder="Their reference, if they gave one"
        onChange={(event) => setReference(event.target.value)}
        className={inputClass}
      />
      {message && (
        <p className="text-xs font-medium text-danger">{message}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            submit(() =>
              recordFilingAction({
                incidentId,
                to,
                filedAt,
                externalReference: reference || undefined,
              }),
            )
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Adding a corrective action.
 *
 * The hierarchy of control is a required choice rather than a note, and each
 * option carries what it means. Somebody reading "PPE — the last line,
 * protects one person, only while worn" while filling the form in occasionally
 * changes their answer, which is the whole reason it is there.
 */
export function AddAction({
  incidentId,
  employees,
}: {
  incidentId: string;
  employees: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [control, setControl] = useState<ControlType>("ENGINEERING");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueAt, setDueAt] = useState("");
  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setDescription("");
    setDueAt("");
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        Add an action
      </button>
    );
  }

  return (
    <div className="space-y-3 border-b border-border px-5 py-4">
      <textarea
        value={description}
        rows={2}
        placeholder="Fit a proper edge protection rail to the east stair core."
        onChange={(event) => setDescription(event.target.value)}
        className={inputClass}
      />

      <div>
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
          What kind of fix
        </span>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {CONTROLS_BY_STRENGTH.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setControl(option)}
              className={`rounded-lg border px-2.5 py-2 text-left transition ${
                control === option
                  ? "border-accent bg-surface-muted"
                  : "border-border hover:bg-surface-muted"
              }`}
            >
              <span className="block text-xs font-medium">
                {CONTROL_LABELS[option]}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted">
                {CONTROL_HINTS[option]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Who owes it
          </span>
          <select
            value={assignedTo}
            onChange={(event) => setAssignedTo(event.target.value)}
            className={inputClass}
          >
            <option value="">Nobody yet</option>
            {employees.map((employee) => (
              <option key={employee.value} value={employee.value}>
                {employee.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            By when
          </span>
          <input
            type="date"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !description || !dueAt}
          onClick={() =>
            submit(() =>
              addActionAction({
                incidentId,
                description,
                control,
                assignedToEmployeeId: assignedTo || undefined,
                dueAt,
              }),
            )
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add it"}
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

export function CompleteAction({ actionId }: { actionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await completeActionAction(actionId);
            if (!result.ok) setError(result.message ?? "That did not work.");
            else router.refresh();
          })
        }
        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition hover:bg-surface-muted disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark done"}
      </button>
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

/**
 * Closing it.
 *
 * The open-action count is shown before the button rather than only in the
 * error, because being told why afterwards is worse than being told first —
 * and because seeing "3 still open" next to a disabled button is what sends
 * somebody to go and chase them.
 */
export function CloseIncident({
  incidentId,
  openActions,
  rootCause,
}: {
  incidentId: string;
  openActions: number;
  rootCause: string;
}) {
  const [cause, setCause] = useState(rootCause);
  const { pending, message, submit } = useFormAction();

  return (
    <div className="space-y-3 px-5 py-4">
      {openActions > 0 ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
          {openActions} corrective {openActions === 1 ? "action is" : "actions are"}{" "}
          still open. Closing the incident is when everybody stops looking, so it
          does not close first.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Whoever investigated this cannot be the one to close it.
        </p>
      )}

      {!rootCause && (
        <textarea
          value={cause}
          rows={3}
          placeholder="Root cause, if it has not been written down yet."
          onChange={(event) => setCause(event.target.value)}
          className={inputClass}
        />
      )}

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <button
        type="button"
        disabled={pending || openActions > 0}
        onClick={() =>
          submit(() =>
            closeIncidentAction({
              incidentId,
              rootCause: cause || undefined,
            }),
          )
        }
        className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Closing…" : "Close this incident"}
      </button>
    </div>
  );
}
