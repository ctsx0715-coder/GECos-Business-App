"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Card, CardHeader, Icon } from "@/components/ui";
import {
  FormActions,
  FormGrid,
  FormMessage,
  FullWidth,
  SelectField,
  TextField,
  useFormAction,
} from "@/components/forms";
import { requestLeaveAction } from "../../actions";
import { workingDaysBetween } from "@/modules/hr/public-holidays";
import type { LeaveBalanceView } from "@/modules/hr/hr.service";

interface Choice {
  value: string;
  label: string;
}

/**
 * A live preview of what a range costs.
 *
 * The same function the service uses, given the same holidays, so the number
 * on the screen is the number that will be charged. It is still only a
 * preview — the count that lands in the ledger is the one the service computes
 * when it parses the request, and if the two ever disagree the server wins.
 */
function workingDays(
  start: string,
  end: string,
  holidays: ReadonlySet<string>,
): number | null {
  if (!start || !end) return null;
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (to < from) return null;
  return workingDaysBetween(from, to, holidays);
}

export function LeaveForm({
  myEmployeeId,
  leaveTypes,
  employees,
  balances,
  holidays,
}: {
  myEmployeeId: string | null;
  leaveTypes: Choice[];
  employees: Choice[];
  balances: LeaveBalanceView[];
  /** Days off in the window the form can book, as YYYY-MM-DD. */
  holidays: string[];
}) {
  const router = useRouter();
  const { pending, message, fieldErrors, submit } = useFormAction();

  const [employeeId, setEmployeeId] = useState(myEmployeeId ?? "");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const holidayDates = useMemo(() => new Set(holidays), [holidays]);
  const days = workingDays(startsAt, endsAt, holidayDates);
  const balance = balances.find((b) => b.leaveTypeId === leaveTypeId);
  const wouldOverdraw =
    balance && !balance.isUncapped && days !== null && days > balance.remainingDays;

  return (
    <Card>
      <CardHeader
        icon="calendar"
        title="Leave request"
        description="The days come off the balance when you submit, not when it is approved"
      />

      <FormGrid>
        {employees.length > 0 && (
          <FullWidth>
            <SelectField
              label="Employee"
              name="employeeId"
              value={employeeId}
              onChange={setEmployeeId}
              options={employees}
              errors={fieldErrors}
              required
              hint="Booking on someone else's behalf is recorded against your name."
            />
          </FullWidth>
        )}

        <SelectField
          label="Type"
          name="leaveTypeId"
          value={leaveTypeId}
          onChange={setLeaveTypeId}
          options={leaveTypes}
          errors={fieldErrors}
          required
        />
        <div />
        <TextField
          label="First day"
          name="startsAt"
          type="date"
          value={startsAt}
          onChange={setStartsAt}
          errors={fieldErrors}
          required
        />
        <TextField
          label="Last day"
          name="endsAt"
          type="date"
          value={endsAt}
          onChange={setEndsAt}
          errors={fieldErrors}
          required
        />
        <FullWidth>
          <TextField
            label="Reason"
            name="reason"
            value={reason}
            onChange={setReason}
            errors={fieldErrors}
            multiline
          />
        </FullWidth>
      </FormGrid>

      {days !== null && (
        <div className="mx-5 mb-4 rounded-[10px] border border-border bg-surface-muted px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <Icon name="calendar" className="text-muted" />
            <span className="tabular font-medium">{days} working days</span>
            {balance && !balance.isUncapped && (
              <span className="tabular text-muted">
                · {balance.remainingDays} remaining
              </span>
            )}
          </p>
          <p className="mt-1.5 flex items-start gap-2 text-xs text-muted">
            <Icon name="alert" size={12} className="mt-0.5 text-warning" />
            Weekends are excluded. South African public holidays are not yet
            deducted — confirm the count against the calendar before submitting.
          </p>
          {wouldOverdraw && (
            <p className="mt-1.5 flex items-start gap-2 text-xs text-danger">
              <Icon name="alert" size={12} className="mt-0.5" />
              That is more than the balance allows and will be refused.
            </p>
          )}
        </div>
      )}

      <FormMessage message={message} />

      <FormActions
        pending={pending}
        submitLabel="Submit request"
        onCancel={() => router.push("/hr/leave")}
        onSubmit={() =>
          submit(() =>
            requestLeaveAction({
              employeeId: employeeId || undefined,
              leaveTypeId: leaveTypeId || undefined,
              startsAt: startsAt || undefined,
              endsAt: endsAt || undefined,
              reason: reason || undefined,
            }),
          )
        }
      />
    </Card>
  );
}
