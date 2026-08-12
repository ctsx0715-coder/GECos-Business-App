"use client";

import { useState } from "react";
import { useFormAction } from "./index";
import {
  addProjectMemberAction,
  createContactAction,
  createMilestoneAction,
  type Choice,
} from "@/app/(app)/create-actions";

/**
 * Inline creators for records that only make sense in the context of a parent.
 *
 * A contact without a customer or a milestone without a project is not a thing
 * anyone wants to fill in a full page for, so these live collapsed at the foot
 * of the panel they belong to and expand in place.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

function Disclosure({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border px-5 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="text-xs font-medium text-accent hover:underline"
      >
        {open ? "Cancel" : label}
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
      {message}
    </p>
  );
}

export function AddContactInline({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setFirstName("");
    setLastName("");
    setJobTitle("");
    setEmail("");
    setPhone("");
    setIsPrimary(false);
  });

  return (
    <Disclosure label="+ Add contact" open={open} onToggle={() => setOpen(!open)}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          className={inputClass}
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          className={inputClass}
        />
      </div>
      <input
        value={jobTitle}
        onChange={(e) => setJobTitle(e.target.value)}
        placeholder="Job title"
        className={inputClass}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputClass}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          className={inputClass}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
          className="size-3.5 accent-[var(--accent)]"
        />
        Primary contact
      </label>

      <ErrorNote message={message} />

      <button
        type="button"
        disabled={pending || !firstName.trim() || !lastName.trim()}
        onClick={() =>
          submit(() =>
            createContactAction({
              customerId,
              firstName,
              lastName,
              jobTitle: jobTitle || undefined,
              email: email || undefined,
              phone: phone || undefined,
              isPrimary,
            }),
          )
        }
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add contact"}
      </button>
    </Disclosure>
  );
}

const PROJECT_ROLES = [
  { value: "MANAGER", label: "Manager" },
  { value: "ENGINEER", label: "Engineer" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "FOREMAN", label: "Foreman" },
  { value: "MEMBER", label: "Member" },
];

export function AddMemberInline({
  projectId,
  users,
}: {
  projectId: string;
  users: Choice[];
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [allocation, setAllocation] = useState("100");

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setUserId("");
  });

  return (
    <Disclosure label="+ Add someone" open={open} onToggle={() => setOpen(!open)}>
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className={inputClass}
      >
        <option value="">Choose a person…</option>
        {users.map((user) => (
          <option key={user.value} value={user.value}>
            {user.label}
          </option>
        ))}
      </select>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={inputClass}
        >
          {PROJECT_ROLES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={allocation}
          onChange={(e) => setAllocation(e.target.value.replace(/\D/g, ""))}
          placeholder="Allocation %"
          className={inputClass}
        />
      </div>

      <ErrorNote message={message} />

      <button
        type="button"
        disabled={pending || !userId}
        onClick={() =>
          submit(() =>
            addProjectMemberAction({
              projectId,
              userId,
              role,
              allocation: Number(allocation) || 100,
            }),
          )
        }
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add to team"}
      </button>
    </Disclosure>
  );
}

export function AddMilestoneInline({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [isPayment, setIsPayment] = useState(false);
  const [value, setValue] = useState("");

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setName("");
    setDueAt("");
    setValue("");
    setIsPayment(false);
  });

  return (
    <Disclosure label="+ Add milestone" open={open} onToggle={() => setOpen(!open)}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Milestone name"
        className={inputClass}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className={inputClass}
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="Value (rands)"
          className={inputClass}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={isPayment}
          onChange={(e) => setIsPayment(e.target.checked)}
          className="size-3.5 accent-[var(--accent)]"
        />
        Payment milestone
      </label>

      <ErrorNote message={message} />

      <button
        type="button"
        disabled={pending || name.trim().length < 3}
        onClick={() =>
          submit(() =>
            createMilestoneAction({
              projectId,
              name,
              dueAt: dueAt || undefined,
              isPaymentMilestone: isPayment,
              valueRands: value ? Number(value) : undefined,
            }),
          )
        }
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add milestone"}
      </button>
    </Disclosure>
  );
}
