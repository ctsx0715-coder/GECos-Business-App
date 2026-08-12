"use client";

import { useState, useTransition } from "react";
import {
  addTask,
  completeProject,
  decideExpense,
  setTaskStatus,
  submitExpense,
} from "../actions";

type Result = { ok: boolean; message?: string };

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(fn: () => Promise<Result>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.message ?? "That did not work.");
      else onDone?.();
    });
  }

  return { pending, error, act, setError };
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
      {message}
    </p>
  );
}

const STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;

/** Cycles a task through its states, prompting for a reason when blocking. */
export function TaskRow({
  projectId,
  taskId,
  status,
}: {
  projectId: string;
  taskId: string;
  status: string;
}) {
  const { pending, error, act } = useAction();
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {STATUSES.map((option) => (
          <button
            key={option}
            type="button"
            disabled={pending || option === status}
            onClick={() => {
              if (option === "BLOCKED") setAsking(true);
              else act(() => setTaskStatus(projectId, taskId, option));
            }}
            className={`rounded px-2 py-0.5 text-[11px] transition disabled:opacity-60 ${
              option === status
                ? "bg-accent text-accent-foreground"
                : "border border-border hover:bg-surface-muted"
            }`}
          >
            {option.toLowerCase().replace("_", " ")}
          </button>
        ))}
      </div>

      {asking && (
        <div className="mt-2 flex gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What is blocking it?"
            className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () => setTaskStatus(projectId, taskId, "BLOCKED", reason),
                () => setAsking(false),
              )
            }
            className="rounded-lg border border-border px-2 py-1 text-xs transition hover:bg-surface-muted"
          >
            Block
          </button>
        </div>
      )}

      <ErrorNote message={error} />
    </div>
  );
}

export function AddTask({ projectId }: { projectId: string }) {
  const { pending, error, act } = useAction();
  const [title, setTitle] = useState("");

  return (
    <div className="border-t border-border px-5 py-4">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={pending || title.trim().length < 3}
          onClick={() => act(() => addTask(projectId, title), () => setTitle(""))}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <ErrorNote message={error} />
    </div>
  );
}

const CATEGORIES = [
  "MATERIALS",
  "LABOUR",
  "PLANT",
  "SUBCONTRACTOR",
  "TRANSPORT",
  "OTHER",
] as const;

export function SubmitExpense({ projectId }: { projectId: string }) {
  const { pending, error, act } = useAction();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("MATERIALS");

  return (
    <div className="border-t border-border px-5 py-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What was the cost for?"
          className="min-w-40 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as (typeof CATEGORIES)[number])
          }
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0) + option.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="Rands"
          className="w-28 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={
            pending || description.trim().length < 3 || Number(amount) <= 0
          }
          onClick={() =>
            act(
              () =>
                submitExpense({
                  projectId,
                  description,
                  category,
                  amountRands: Number(amount),
                }),
              () => {
                setDescription("");
                setAmount("");
              },
            )
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          Submit
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Submitted costs show as pending. They only count against the budget once
        approved — and nobody can approve their own.
      </p>
      <ErrorNote message={error} />
    </div>
  );
}

export function ExpenseDecision({
  projectId,
  expenseId,
}: {
  projectId: string;
  expenseId: string;
}) {
  const { pending, error, act } = useAction();
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  return (
    <div>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => decideExpense(projectId, expenseId, "APPROVED"))}
          className="rounded px-2 py-0.5 text-[11px] text-success transition hover:bg-success-soft disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setAsking((v) => !v)}
          className="rounded px-2 py-0.5 text-[11px] text-danger transition hover:bg-danger-soft disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {asking && (
        <div className="mt-1 flex gap-1">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason"
            className="w-40 rounded border border-border bg-surface px-2 py-0.5 text-[11px] outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () => decideExpense(projectId, expenseId, "REJECTED", reason),
                () => setAsking(false),
              )
            }
            className="rounded border border-border px-2 py-0.5 text-[11px]"
          >
            Confirm
          </button>
        </div>
      )}

      <ErrorNote message={error} />
    </div>
  );
}

export function CompleteProject({ projectId }: { projectId: string }) {
  const { pending, error, act } = useAction();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => act(() => completeProject(projectId))}
        className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted disabled:opacity-50"
      >
        {pending ? "Closing…" : "Mark complete"}
      </button>
      <ErrorNote message={error} />
    </div>
  );
}
