"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import {
  FormActions,
  FormGrid,
  FormMessage,
  FullWidth,
  SelectField,
  TextField,
  useFormAction,
} from "@/components/forms";
import { createLeaveTypeAction, updateLeaveTypeAction } from "../../actions";

/**
 * One form for creating and editing.
 *
 * The two differ in exactly two places — the code cannot be changed once it
 * exists, and only an existing type can be retired — which is a smaller
 * difference than two forms' worth of duplicated policy fields would be.
 */

const ACCRUAL_METHODS = [
  { value: "MANUAL", label: "Set by hand" },
  { value: "ANNUAL_GRANT", label: "Granted in full at the start of the cycle" },
  { value: "MONTHLY_ACCRUAL", label: "Accrues each completed month" },
];

const ACCRUAL_HINTS: Record<string, string> = {
  MANUAL: "Nothing is credited automatically. HR writes the entitlement.",
  ANNUAL_GRANT:
    "The whole entitlement lands on 1 January, or on a joiner's first day. Not pro-rated.",
  MONTHLY_ACCRUAL:
    "Days are credited for each calendar month worked in full. 1.25 a month reaches the BCEA's 15-day minimum.",
};

export interface LeaveTypeValues {
  id?: string;
  code: string;
  name: string;
  description: string;
  daysPerCycle: string;
  isPaid: boolean;
  carryOverMaxDays: string;
  documentRequiredAfterDays: string;
  allowsBackdating: boolean;
  accrualMethod: string;
  accrualDaysPerPeriod: string;
  sortOrder: string;
  isActive: boolean;
}

export const BLANK_LEAVE_TYPE: LeaveTypeValues = {
  code: "",
  name: "",
  description: "",
  daysPerCycle: "",
  isPaid: true,
  carryOverMaxDays: "",
  documentRequiredAfterDays: "",
  allowsBackdating: false,
  accrualMethod: "MANUAL",
  accrualDaysPerPeriod: "",
  sortOrder: "0",
  isActive: true,
};

/** "" means "not set", which for these columns is null rather than zero. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function Checkbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

export function LeaveTypeForm({ initial }: { initial: LeaveTypeValues }) {
  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();
  const editing = Boolean(initial.id);

  const [values, setValues] = useState(initial);
  const set = <K extends keyof LeaveTypeValues>(
    key: K,
    value: LeaveTypeValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  return (
    <Card>
      <CardHeader
        icon="calendar"
        title={editing ? initial.name : "New leave type"}
        description={
          editing
            ? `Code ${initial.code} · the code is fixed, everything else can change`
            : "The code is how imports and the demo data find this type later, so it cannot be changed afterwards"
        }
      />

      <FormGrid>
        {!editing && (
          <TextField
            label="Code"
            name="code"
            value={values.code}
            onChange={(value) => set("code", value.toUpperCase())}
            errors={fieldErrors}
            placeholder="ANNUAL"
            required
            hint="Capitals, digits and underscores."
          />
        )}
        <TextField
          label="Name"
          name="name"
          value={values.name}
          onChange={(value) => set("name", value)}
          errors={fieldErrors}
          placeholder="Annual leave"
          required
        />
        <TextField
          label="Days per cycle"
          name="daysPerCycle"
          value={values.daysPerCycle}
          onChange={(value) => set("daysPerCycle", value.replace(/[^\d.]/g, ""))}
          errors={fieldErrors}
          hint="Leave blank for uncapped, which is how unpaid leave is expressed."
        />
        <TextField
          label="Carry over limit"
          name="carryOverMaxDays"
          value={values.carryOverMaxDays}
          onChange={(value) =>
            set("carryOverMaxDays", value.replace(/[^\d.]/g, ""))
          }
          errors={fieldErrors}
          hint="Days that may cross into next cycle. Blank for none."
        />
        <SelectField
          label="How it is credited"
          name="accrualMethod"
          value={values.accrualMethod}
          onChange={(value) => set("accrualMethod", value)}
          options={ACCRUAL_METHODS}
          errors={fieldErrors}
          hint={ACCRUAL_HINTS[values.accrualMethod]}
        />
        <TextField
          label="Days per month"
          name="accrualDaysPerPeriod"
          value={values.accrualDaysPerPeriod}
          onChange={(value) =>
            set("accrualDaysPerPeriod", value.replace(/[^\d.]/g, ""))
          }
          errors={fieldErrors}
          hint={
            values.accrualMethod === "MONTHLY_ACCRUAL"
              ? "Required for monthly accrual — 1.25 is the statutory rate."
              : "Only used by monthly accrual."
          }
        />
        <TextField
          label="Medical note required after"
          name="documentRequiredAfterDays"
          value={values.documentRequiredAfterDays}
          onChange={(value) =>
            set("documentRequiredAfterDays", value.replace(/[^\d]/g, ""))
          }
          errors={fieldErrors}
          hint="Days. The BCEA says two for sick leave. Blank for never."
        />
        <TextField
          label="Order in lists"
          name="sortOrder"
          value={values.sortOrder}
          onChange={(value) => set("sortOrder", value.replace(/[^\d]/g, ""))}
          errors={fieldErrors}
        />
        <FullWidth>
          <TextField
            label="Description"
            name="description"
            value={values.description}
            onChange={(value) => set("description", value)}
            errors={fieldErrors}
            multiline
            placeholder="What this covers, and which agreement it comes from."
          />
        </FullWidth>
        <FullWidth>
          <div className="grid gap-3 rounded-[10px] border border-border bg-surface-muted px-4 py-3 sm:grid-cols-2">
            <Checkbox
              label="Paid"
              hint="Unpaid leave still needs approval, it just costs nothing."
              checked={values.isPaid}
              onChange={(value) => set("isPaid", value)}
            />
            <Checkbox
              label="May be booked for dates that have passed"
              hint="Sick leave usually is. Annual leave usually is not."
              checked={values.allowsBackdating}
              onChange={(value) => set("allowsBackdating", value)}
            />
            {editing && (
              <Checkbox
                label="Available for new requests"
                hint="Retiring a type keeps every balance and request it already has."
                checked={values.isActive}
                onChange={(value) => set("isActive", value)}
              />
            )}
          </div>
        </FullWidth>
      </FormGrid>

      <FormMessage message={message} />

      <FormActions
        pending={pending}
        submitLabel={editing ? "Save changes" : "Create leave type"}
        onCancel={() => router.push("/hr/leave/types")}
        onSubmit={() =>
          submit(() => {
            const policy = {
              name: values.name,
              description: values.description || undefined,
              daysPerCycle: numberOrNull(values.daysPerCycle),
              isPaid: values.isPaid,
              carryOverMaxDays: numberOrNull(values.carryOverMaxDays),
              documentRequiredAfterDays: numberOrNull(
                values.documentRequiredAfterDays,
              ),
              allowsBackdating: values.allowsBackdating,
              accrualMethod: values.accrualMethod,
              accrualDaysPerPeriod: numberOrNull(values.accrualDaysPerPeriod),
              sortOrder: numberOrNull(values.sortOrder) ?? 0,
            };

            return initial.id
              ? updateLeaveTypeAction({
                  ...policy,
                  leaveTypeId: initial.id,
                  isActive: values.isActive,
                })
              : createLeaveTypeAction({ ...policy, code: values.code });
          })
        }
      />
    </Card>
  );
}
