"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormAction } from "@/components/forms";
import { Icon } from "@/components/ui";
import {
  addHolidayAction,
  generateHolidaysAction,
  removeHolidayAction,
} from "../../actions";

/** The controls on the holidays screen. */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

/**
 * Fill a year from the calculation.
 *
 * Idempotent, and it never overwrites: a day already recorded is left as it
 * is, so pressing this after adding a shutdown does not disturb the shutdown.
 */
export function GenerateYear({ year }: { year: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <span className="flex items-center gap-2">
      {message && (
        <span
          className={`text-xs ${failed ? "font-medium text-danger" : "text-muted"}`}
        >
          {message}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await generateHolidaysAction(year);
            setFailed(!result.ok);
            setMessage(result.message ?? (result.ok ? "Done." : "That failed."));
            if (result.ok) router.refresh();
          })
        }
        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border bg-surface px-2.5 text-xs font-medium transition hover:bg-surface-muted disabled:opacity-50"
      >
        <Icon name="calendar" size={14} />
        {pending ? "Adding…" : "Generate statutory days"}
      </button>
    </span>
  );
}

export function AddHolidayInline({ year }: { year: number }) {
  const [open, setOpen] = useState(false);
  const [observedOn, setObservedOn] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const { pending, message, submit } = useFormAction(() => {
    setOpen(false);
    setObservedOn("");
    setName("");
    setNotes("");
  });

  return (
    <div className="border-t border-border px-5 py-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs font-medium text-accent hover:underline"
      >
        {open ? "Cancel" : "+ Add a company day off"}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={observedOn}
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              onChange={(event) => setObservedOn(event.target.value)}
              className={inputClass}
            />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Shutdown, election day…"
              className={inputClass}
            />
          </div>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Note — optional"
            className={inputClass}
          />

          <p className="px-1 text-xs text-muted">
            Recorded as a company day rather than a statutory one, and leave is
            not charged for it.
          </p>
          {message && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              {message}
            </p>
          )}

          <button
            type="button"
            disabled={pending || !observedOn || name.trim().length < 2}
            onClick={() =>
              submit(() =>
                addHolidayAction({
                  observedOn,
                  name,
                  isStatutory: false,
                  notes: notes || undefined,
                }),
              )
            }
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add day off"}
          </button>
        </div>
      )}
    </div>
  );
}

export function RemoveHoliday({
  holidayId,
  name,
}: {
  holidayId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title={`Remove ${name}`}
      aria-label={`Remove ${name}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeHolidayAction(holidayId);
          if (result.ok) router.refresh();
        })
      }
      className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-surface-muted hover:text-danger disabled:opacity-50"
    >
      <Icon name="trash" size={14} />
    </button>
  );
}
