"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormAction } from "@/components/forms";
import { Icon } from "@/components/ui";
import {
  addStepAction,
  createChainAction,
  moveStepAction,
  removeStepAction,
  setChainActiveAction,
} from "./actions";

/**
 * Editing the hierarchy.
 *
 * Steps are added at the bottom and moved with arrows rather than dragged: the
 * order is the whole meaning of a chain, and a list of four things nudged into
 * place is easier to get right — and to undo — than a drag that has to be
 * repeated because it landed one row out.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

interface Choice {
  value: string;
  label: string;
}

const ENTITIES: Choice[] = [
  { value: "TENDER", label: "Tenders" },
  { value: "EXPENSE", label: "Project expenses" },
  { value: "PROJECT", label: "Projects" },
];

/** The events services actually raise. A chain on anything else never runs. */
const TRIGGERS: Record<string, Choice[]> = {
  TENDER: [
    {
      value: "tender.submitted_for_approval",
      label: "When a tender is submitted for approval",
    },
  ],
  EXPENSE: [
    { value: "expense.submitted", label: "When an expense is submitted" },
  ],
  PROJECT: [{ value: "project.closed", label: "When a project is closed" }],
};

export function NewChain() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState("TENDER");
  const [triggerEvent, setTriggerEvent] = useState(
    "tender.submitted_for_approval",
  );

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setName("");
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-[10px] border border-accent bg-accent px-3 text-sm font-medium text-accent-foreground transition hover:opacity-90"
      >
        New chain
      </button>
    );
  }

  return (
    <div className="w-full max-w-md space-y-2 rounded-[14px] border border-border bg-surface p-4">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name, e.g. Expense approval"
        className={inputClass}
      />
      <select
        value={entityType}
        onChange={(event) => {
          setEntityType(event.target.value);
          setTriggerEvent(TRIGGERS[event.target.value][0].value);
        }}
        className={inputClass}
      >
        {ENTITIES.map((entity) => (
          <option key={entity.value} value={entity.value}>
            {entity.label}
          </option>
        ))}
      </select>
      <select
        value={triggerEvent}
        onChange={(event) => setTriggerEvent(event.target.value)}
        className={inputClass}
      >
        {(TRIGGERS[entityType] ?? []).map((trigger) => (
          <option key={trigger.value} value={trigger.value}>
            {trigger.label}
          </option>
        ))}
      </select>

      <p className="px-1 text-xs text-muted">
        A new chain starts switched off. Add its steps, then turn it on.
      </p>
      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || name.trim().length < 3}
          onClick={() =>
            submit(() => createChainAction({ name, entityType, triggerEvent }))
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Create chain"}
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

export function ChainSwitch({
  chainId,
  isActive,
}: {
  chainId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs font-medium text-danger">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setChainActiveAction(chainId, !isActive);
            if (result.ok) router.refresh();
            else setError(result.message ?? "That could not be changed.");
          })
        }
        className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-2.5 text-xs font-medium transition disabled:opacity-50 ${
          isActive
            ? "border-border bg-surface hover:bg-surface-muted"
            : "border-accent bg-accent text-accent-foreground hover:opacity-90"
        }`}
      >
        <Icon name={isActive ? "ban" : "check"} size={14} />
        {isActive ? "Switch off" : "Switch on"}
      </button>
    </span>
  );
}

export function StepControls({
  stepId,
  isFirst,
  isLast,
}: {
  stepId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) router.refresh();
    });

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label="Move earlier"
        disabled={pending || isFirst}
        onClick={() => act(() => moveStepAction(stepId, "UP"))}
        className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
      >
        <Icon name="arrowUp" size={14} />
      </button>
      <button
        type="button"
        aria-label="Move later"
        disabled={pending || isLast}
        onClick={() => act(() => moveStepAction(stepId, "DOWN"))}
        className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
      >
        <Icon name="arrowDown" size={14} />
      </button>
      <button
        type="button"
        aria-label="Remove step"
        disabled={pending}
        onClick={() => act(() => removeStepAction(stepId))}
        className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-surface-muted hover:text-danger disabled:opacity-30"
      >
        <Icon name="trash" size={14} />
      </button>
    </span>
  );
}

export function AddStep({
  chainId,
  roles,
  users,
}: {
  chainId: string;
  roles: Choice[];
  users: Choice[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [approverType, setApproverType] = useState("ROLE");
  const [approverRoleId, setApproverRoleId] = useState(roles[0]?.value ?? "");
  const [approverUserId, setApproverUserId] = useState(users[0]?.value ?? "");
  const [slaHours, setSlaHours] = useState("48");
  const [conditionField, setConditionField] = useState("");
  const [conditionOperator, setConditionOperator] = useState("GT");
  const [conditionValue, setConditionValue] = useState("");

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setName("");
    setConditionField("");
    setConditionValue("");
  });

  return (
    <div className="border-t border-border px-5 py-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs font-medium text-accent hover:underline"
      >
        {open ? "Cancel" : "+ Add an approval step"}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Step name, e.g. Finance review"
            className={inputClass}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={approverType}
              onChange={(event) => setApproverType(event.target.value)}
              className={inputClass}
            >
              <option value="ROLE">Whoever holds a role</option>
              <option value="MANAGER">The requester&apos;s manager</option>
              <option value="USER">One named person</option>
            </select>

            {approverType === "ROLE" && (
              <select
                value={approverRoleId}
                onChange={(event) => setApproverRoleId(event.target.value)}
                className={inputClass}
              >
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            )}
            {approverType === "USER" && (
              <select
                value={approverUserId}
                onChange={(event) => setApproverUserId(event.target.value)}
                className={inputClass}
              >
                {users.map((user) => (
                  <option key={user.value} value={user.value}>
                    {user.label}
                  </option>
                ))}
              </select>
            )}
            {approverType === "MANAGER" && (
              <p className="self-center px-1 text-xs text-muted">
                Resolved per requester, which is what makes it a hierarchy
                rather than a list.
              </p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <input
              value={slaHours}
              inputMode="numeric"
              onChange={(event) => setSlaHours(event.target.value.replace(/\D/g, ""))}
              placeholder="Hours to respond"
              className={inputClass}
            />
            <input
              value={conditionField}
              onChange={(event) => setConditionField(event.target.value)}
              placeholder="Only when… field"
              className={inputClass}
            />
            <select
              value={conditionOperator}
              onChange={(event) => setConditionOperator(event.target.value)}
              className={inputClass}
            >
              <option value="GT">is over</option>
              <option value="GTE">is at least</option>
              <option value="LT">is under</option>
              <option value="LTE">is at most</option>
              <option value="EQ">is</option>
              <option value="NEQ">is not</option>
            </select>
            <input
              value={conditionValue}
              onChange={(event) => setConditionValue(event.target.value)}
              placeholder="value"
              className={inputClass}
            />
          </div>

          <p className="px-1 text-xs text-muted">
            Leave the condition blank and the step always applies. Fill it in
            and the step only appears when the record matches — money is in
            cents, so five million rand is 500000000.
          </p>
          {message && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {message}
            </p>
          )}

          <button
            type="button"
            disabled={pending || name.trim().length < 2}
            onClick={() =>
              submit(() =>
                addStepAction({
                  chainId,
                  name,
                  approverType,
                  approverRoleId: approverType === "ROLE" ? approverRoleId : null,
                  approverUserId: approverType === "USER" ? approverUserId : null,
                  slaHours: slaHours ? Number(slaHours) : null,
                  conditionField: conditionField || null,
                  conditionOperator: conditionField ? conditionOperator : null,
                  conditionValue: conditionField ? conditionValue : null,
                }),
              )
            }
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add step"}
          </button>
        </div>
      )}
    </div>
  );
}
