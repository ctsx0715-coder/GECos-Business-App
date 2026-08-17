"use client";

import { useState } from "react";
import { useFormAction } from "@/components/forms";
import { createStoreAction, updateStoreAction } from "../actions";

/**
 * Opening a store, and saying which one a delivery lands in.
 *
 * Inline rather than on a page of its own: a contractor opens a store when a
 * job starts and not otherwise, so this is a handful of rows a year and does
 * not deserve a form somebody has to navigate to.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

const linkClass =
  "text-xs font-medium text-accent hover:underline disabled:opacity-50";

export function AddStoreInline({
  projects,
}: {
  projects: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [address, setAddress] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setName("");
    setProjectId("");
    setAddress("");
    setIsDefault(false);
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        Open a store
      </button>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Name
          </span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Mamelodi site store"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            On which site
          </span>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className={inputClass}
          >
            <option value="">None — the yard or the office</option>
            {projects.map((project) => (
              <option key={project.value} value={project.value}>
                {project.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Where
          </span>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
        />
        Deliveries land here unless somebody says otherwise
      </label>

      {message && <p className="text-xs font-medium text-danger">{message}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || name.trim().length < 2}
          onClick={() =>
            submit(() =>
              createStoreAction({
                name,
                projectId: projectId || null,
                address: address || undefined,
                isDefault,
              }),
            )
          }
          className={linkClass}
        >
          {pending ? "Saving…" : "Open it"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Making a store the one deliveries land in.
 *
 * Nothing here can clear the flag, only move it. A tenant with no default has
 * nowhere for a receipt to go by default, which is a state worth being unable
 * to reach by accident.
 */
export function MakeDefault({
  id,
  name,
  projectId,
}: {
  id: string;
  name: string;
  projectId: string | null;
}) {
  const { pending, message, submit } = useFormAction();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          submit(() =>
            updateStoreAction({ id, name, projectId, isDefault: true }),
          )
        }
        className="text-xs text-muted hover:underline disabled:opacity-50"
      >
        {pending ? "Saving…" : "Make it the default"}
      </button>
      {message && <span className="text-xs text-danger">{message}</span>}
    </>
  );
}
