"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui";
import {
  FormActions,
  FormField,
  FormGrid,
  FormMessage,
  FullWidth,
  SelectField,
  TextField,
  useFormAction,
} from "@/components/forms";
import { KIND_HINTS, KIND_LABELS, KINDS_BY_SEVERITY } from "@/modules/hse/vocabulary";
import type { IncidentKind } from "@/modules/hse/reportability";
import { reportIncidentAction } from "../../actions";

/**
 * Reporting one.
 *
 * Short on purpose. This gets filled in on a phone, often standing next to the
 * thing that just happened, and every field added to it is a field somebody
 * decides to do later and then never does. What is asked for here is only what
 * cannot be reconstructed afterwards: when, what kind, and what happened.
 * Root cause, days off work and corrective actions all belong to the
 * investigation, which happens sitting down.
 *
 * The kinds carry their definitions rather than only their names. The
 * difference between first aid and medical treatment decides whether the
 * Compensation Fund has to be told, and nobody picking from a list of eight
 * nouns can be expected to know that unless it says so.
 */

interface Option {
  value: string;
  label: string;
}

/** Kinds where somebody was hurt, so the form has to ask who. */
const INJURIES: ReadonlySet<string> = new Set([
  "FIRST_AID",
  "MEDICAL_TREATMENT",
  "LOST_TIME",
  "PERMANENT_DISABILITY",
  "FATALITY",
]);

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the browser's own clock. */
function nowForInput(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

export function ReportIncidentForm({
  projects,
  employees,
}: {
  projects: Option[];
  employees: Option[];
}) {
  const [kind, setKind] = useState<IncidentKind>("NEAR_MISS");
  const [occurredAt, setOccurredAt] = useState(nowForInput());
  const [projectId, setProjectId] = useState("");
  const [place, setPlace] = useState("");
  const [injuredEmployeeId, setInjuredEmployeeId] = useState("");
  const [injuredPersonName, setInjuredPersonName] = useState("");
  const [description, setDescription] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [dangerousOccurrence, setDangerousOccurrence] = useState(false);

  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();
  const isInjury = INJURIES.has(kind);

  return (
    <Card>
      <CardHeader
        title="What happened"
        description="Short on purpose — the investigation asks the rest"
      />

      <FormGrid>
        <FullWidth>
          <FormField label="What kind" name="kind" required errors={fieldErrors}>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {KINDS_BY_SEVERITY.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    kind === option
                      ? "border-accent bg-surface-muted"
                      : "border-border hover:bg-surface-muted"
                  }`}
                >
                  <span className="block text-sm font-medium">
                    {KIND_LABELS[option]}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {KIND_HINTS[option]}
                  </span>
                </button>
              ))}
            </div>
          </FormField>
        </FullWidth>

        <TextField
          label="When it happened"
          name="occurredAt"
          type="datetime-local"
          value={occurredAt}
          onChange={setOccurredAt}
          errors={fieldErrors}
          required
          hint="Before or after the shift change is a different account of the same day"
        />

        <SelectField
          label="Which site"
          name="projectId"
          value={projectId}
          onChange={setProjectId}
          errors={fieldErrors}
          options={projects}
          placeholder="The yard or the office"
        />

        <TextField
          label="Whereabouts"
          name="place"
          value={place}
          onChange={setPlace}
          errors={fieldErrors}
          placeholder="Level 3, east stair core"
          hint="In the words you would use over the radio"
        />

        {isInjury && (
          <>
            <SelectField
              label="Who was hurt"
              name="injuredEmployeeId"
              value={injuredEmployeeId}
              onChange={setInjuredEmployeeId}
              errors={fieldErrors}
              options={employees}
              placeholder="Not one of ours"
            />
            <TextField
              label="Or their name"
              name="injuredPersonName"
              value={injuredPersonName}
              onChange={setInjuredPersonName}
              errors={fieldErrors}
              placeholder="Subcontractor, driver, visitor"
              hint="Neither reporting duty cares whose payroll they were on"
            />
          </>
        )}

        <FullWidth>
          <TextField
            label="What happened"
            name="description"
            value={description}
            onChange={setDescription}
            errors={fieldErrors}
            multiline
            required
            placeholder="A scaffold plank was not clipped and slid when it was stepped on."
          />
        </FullWidth>

        <FullWidth>
          <TextField
            label="What was done at the time"
            name="immediateAction"
            value={immediateAction}
            onChange={setImmediateAction}
            errors={fieldErrors}
            multiline
            placeholder="Area barricaded, scaffold tagged out, first aid given on site."
          />
        </FullWidth>

        <FullWidth>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 transition hover:bg-surface-muted">
            <input
              type="checkbox"
              checked={dangerousOccurrence}
              onChange={(event) => setDangerousOccurrence(event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-medium">
                A spill, a release under pressure, or machinery that failed or ran
                out of control
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Section 24 of the OHSA makes this reportable whether or not
                anybody was hurt, so it has to be asked separately.
              </span>
            </span>
          </label>
        </FullWidth>

        <FullWidth>
          <FormMessage message={message} />
        </FullWidth>
      </FormGrid>

      <FormActions
        pending={pending}
        submitLabel="Report it"
        onCancel={() => router.push("/hse/incidents")}
        onSubmit={() =>
          submit(() =>
            reportIncidentAction({
              kind,
              occurredAt,
              projectId: projectId || undefined,
              place: place || undefined,
              injuredEmployeeId: isInjury && injuredEmployeeId ? injuredEmployeeId : undefined,
              injuredPersonName:
                isInjury && injuredPersonName ? injuredPersonName : undefined,
              description,
              immediateAction: immediateAction || undefined,
              dangerousOccurrence,
            }),
          )
        }
      />
    </Card>
  );
}
