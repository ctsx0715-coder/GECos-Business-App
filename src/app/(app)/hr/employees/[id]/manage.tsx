"use client";

import { useState } from "react";
import { useFormAction } from "@/components/forms";
import { Icon } from "@/components/ui";
import {
  addCertificationAction,
  adjustBalanceAction,
  removeCertificationAction,
} from "../../actions";

/**
 * The things HR does to one person's record without leaving it.
 *
 * Adding a ticket and topping up a balance are both two-field jobs that make
 * no sense away from the person they belong to, so they sit collapsed at the
 * foot of the panel they affect — the same shape the CRM and Projects screens
 * use for contacts and milestones.
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

function Note({ message, tone }: { message: string | null; tone: "danger" | "muted" }) {
  if (!message) return null;
  return (
    <p
      className={
        tone === "danger"
          ? "rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger"
          : "px-1 text-xs text-muted"
      }
    >
      {message}
    </p>
  );
}

const CATEGORIES = [
  { value: "TRAINING", label: "Training" },
  { value: "MEDICAL", label: "Medical" },
  { value: "HSE", label: "HSE" },
  { value: "LICENCE", label: "Licence" },
  { value: "ACCREDITATION", label: "Accreditation" },
];

export function AddCertificationInline({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const [requirementName, setRequirementName] = useState("");
  const [category, setCategory] = useState("TRAINING");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [providerName, setProviderName] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setRequirementName("");
    setCertificateNumber("");
    setProviderName("");
    setIssuedAt("");
    setExpiresAt("");
  });

  return (
    <Disclosure
      label="+ Add certification"
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <input
        value={requirementName}
        onChange={(event) => setRequirementName(event.target.value)}
        placeholder="Working at heights, coded welding, medical certificate…"
        className={inputClass}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className={inputClass}
        >
          {CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={providerName}
          onChange={(event) => setProviderName(event.target.value)}
          placeholder="Issued by"
          className={inputClass}
        />
      </div>
      <input
        value={certificateNumber}
        onChange={(event) => setCertificateNumber(event.target.value)}
        placeholder="Certificate number"
        className={inputClass}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Issued
          </span>
          <input
            type="date"
            value={issuedAt}
            onChange={(event) => setIssuedAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Expires
          </span>
          <input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <Note
        tone="muted"
        message="Leave the expiry blank for a qualification that does not expire — a trade test, for instance."
      />
      <Note tone="danger" message={message} />

      <button
        type="button"
        disabled={pending || !requirementName.trim()}
        onClick={() =>
          submit(() =>
            addCertificationAction({
              employeeId,
              requirementName,
              category,
              certificateNumber: certificateNumber || undefined,
              providerName: providerName || undefined,
              issuedAt: issuedAt || undefined,
              expiresAt: expiresAt || undefined,
            }),
          )
        }
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add certification"}
      </button>
    </Disclosure>
  );
}

export function RemoveCertification({
  certificationId,
  employeeId,
  name,
}: {
  certificationId: string;
  employeeId: string;
  name: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        title={`Remove ${name}`}
        aria-label={`Remove ${name}`}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await removeCertificationAction(
            certificationId,
            employeeId,
          );
          setPending(false);
          if (!result.ok) setError(result.message ?? "That could not be removed.");
        }}
        className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-surface-muted hover:text-danger disabled:opacity-50"
      >
        <Icon name="trash" size={14} />
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );
}

/**
 * Adding or removing days.
 *
 * Signed, and a reason is required. A balance that changed for a reason nobody
 * wrote down is one somebody will eventually have to defend at a CCMA hearing
 * from memory.
 */
export function AdjustBalanceInline({
  employeeId,
  leaveTypes,
}: {
  employeeId: string;
  leaveTypes: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.value ?? "");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setDays("");
    setReason("");
  });

  if (leaveTypes.length === 0) return null;

  return (
    <Disclosure label="+ Add leave days" open={open} onToggle={() => setOpen(!open)}>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={leaveTypeId}
          onChange={(event) => setLeaveTypeId(event.target.value)}
          className={inputClass}
        >
          {leaveTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={days}
          inputMode="decimal"
          onChange={(event) =>
            setDays(event.target.value.replace(/[^\d.-]/g, ""))
          }
          placeholder="Days, e.g. 3 or -1.5"
          className={inputClass}
        />
      </div>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why — worked a public holiday, correction, long-service award…"
        className={inputClass}
      />

      <Note
        tone="muted"
        message="Applies to the cycle in progress. A negative number takes days back."
      />
      <Note tone="danger" message={message} />

      <button
        type="button"
        disabled={pending || !days || Number.isNaN(Number(days)) || reason.trim().length < 3}
        onClick={() =>
          submit(() =>
            adjustBalanceAction({
              employeeId,
              leaveTypeId,
              days: Number(days),
              reason,
            }),
          )
        }
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Apply"}
      </button>
    </Disclosure>
  );
}
