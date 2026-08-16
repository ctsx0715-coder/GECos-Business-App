"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { describeDuration } from "@/modules/hr/timesheets";
import {
  approveTimeEntriesAction,
  clockInAction,
  clockOutAction,
  correctTimeEntryAction,
  withdrawTimeApprovalAction,
} from "../actions";

/**
 * The clock, and the week that comes out of it.
 *
 * One button, as large as the thing deserves. A site clerk clocking eighteen
 * people in on a phone at ten past six should not be hunting for a control,
 * and a person clocking themselves in should not have to think about which
 * screen they are on.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export interface Row {
  id: string;
  employeeId: string;
  name: string;
  workedOn: string;
  clockedIn: string;
  clockedOut: string | null;
  breakMinutes: number;
  minutes: number;
  projectName: string | null;
  shiftName: string | null;
  overtime: number;
  undertime: number;
  approved: boolean;
  approvedBy: string | null;
  running: boolean;
  looksForgotten: boolean;
  note: string | null;
  /** ISO datetimes, for pre-filling a correction. */
  clockedInAt: string;
  clockedOutAt: string | null;
}

/** The signed-in person's own clock. */
export function MyClock({
  employeeId,
  open,
}: {
  employeeId: string;
  open: { since: string; minutesSoFar: number; projectName: string | null } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(60);

  function act(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setMessage(result.message ?? "That did not work.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-border bg-surface p-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {open ? "On the clock" : "Not clocked in"}
        </p>
        <p className="text-xs text-muted">
          {open
            ? `Since ${open.since}${open.projectName ? ` · ${open.projectName}` : ""} · ${
                open.minutesSoFar < 1
                  ? "just now"
                  : `${describeDuration(open.minutesSoFar)} so far`
              }`
            : "Clock in when you start. The hours are worked out from the two moments, not typed in."}
        </p>
        {message && (
          <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {message}
          </p>
        )}
      </div>

      {open && (
        <label className="text-xs text-muted">
          <span className="mb-1 block uppercase tracking-wide text-faint">
            Break (min)
          </span>
          <input
            value={String(breakMinutes)}
            inputMode="numeric"
            onChange={(event) =>
              setBreakMinutes(Number(event.target.value.replace(/\D/g, "")) || 0)
            }
            className={`${inputClass} w-24`}
          />
        </label>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          act(() =>
            open
              ? clockOutAction({ employeeId, breakMinutes })
              : clockInAction({ employeeId }),
          )
        }
        className={`h-11 rounded-[12px] px-5 text-sm font-medium transition disabled:opacity-50 ${
          open
            ? "border border-border bg-surface hover:bg-surface-muted"
            : "bg-accent text-accent-foreground hover:opacity-90"
        }`}
      >
        {pending ? "…" : open ? "Clock out" : "Clock in"}
      </button>
    </div>
  );
}

/** Clocking somebody else on or off, for a supervisor. */
export function ClockSomebody({
  people,
}: {
  people: Array<{ id: string; name: string; onTheClock: boolean }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState(people[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const chosen = people.find((person) => person.id === employeeId);

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-3">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
          Somebody else
        </span>
        <select
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          className={`${inputClass} min-w-56`}
        >
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.onTheClock ? " — on the clock" : ""}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        disabled={pending || !employeeId}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = chosen?.onTheClock
              ? await clockOutAction({ employeeId, breakMinutes: 60 })
              : await clockInAction({ employeeId });
            if (!result.ok) setMessage(result.message ?? "That did not work.");
            router.refresh();
          })
        }
        className="h-9 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-50"
      >
        {chosen?.onTheClock ? "Clock them out" : "Clock them in"}
      </button>

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

export function Timesheet({
  rows,
  mayApprove,
  mayManage,
}: {
  rows: Row[];
  mayApprove: boolean;
  mayManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const approvable = rows.filter((row) => !row.approved && !row.running);

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    );
  }

  return (
    <div className="space-y-3">
      {message && (
        <p className="mx-5 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {message}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              {mayApprove && <th className="w-10 px-3 py-2" />}
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">In</th>
              <th className="px-3 py-2 font-medium">Out</th>
              <th className="px-3 py-2 font-medium">Worked</th>
              <th className="px-3 py-2 font-medium">Against the shift</th>
              <th className="px-3 py-2 font-medium">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className={row.approved ? "text-muted" : undefined}>
                  {mayApprove && (
                    <td className="px-3 py-2">
                      {!row.approved && !row.running && (
                        <input
                          type="checkbox"
                          checked={chosen.includes(row.id)}
                          onChange={() => toggle(row.id)}
                          aria-label={`Select ${row.name} on ${row.workedOn}`}
                          className="size-4 accent-[var(--accent)]"
                        />
                      )}
                    </td>
                  )}
                  <td className="tabular px-3 py-2">{row.workedOn}</td>
                  <td className="px-3 py-2">
                    <span className="block">{row.name}</span>
                    <span className="block text-xs text-faint">
                      {[row.projectName, row.shiftName].filter(Boolean).join(" · ") ||
                        "No site or shift recorded"}
                    </span>
                  </td>
                  <td className="tabular px-3 py-2">{row.clockedIn}</td>
                  <td className="tabular px-3 py-2">
                    {row.clockedOut ?? (
                      <span className="text-warning">running</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2">
                    {describeDuration(row.minutes)}
                    {row.breakMinutes > 0 && (
                      <span className="ml-1 text-xs text-faint">
                        (−{row.breakMinutes}m)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.overtime > 0 && (
                      <span className="text-warning">
                        +{describeDuration(row.overtime)}
                      </span>
                    )}
                    {row.undertime > 0 && (
                      <span className="text-muted">
                        −{describeDuration(row.undertime)}
                      </span>
                    )}
                    {row.overtime === 0 && row.undertime === 0 && (
                      <span className="text-faint">
                        {row.running || !row.shiftName ? "—" : "as planned"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.approved ? (
                      <Badge tone="success" icon="check">
                        signed off
                      </Badge>
                    ) : row.looksForgotten ? (
                      <Badge tone="danger" icon="alert">
                        never closed
                      </Badge>
                    ) : row.running ? (
                      <Badge tone="warning" icon="clock">
                        on the clock
                      </Badge>
                    ) : (
                      <span className="text-xs text-faint">awaiting sign-off</span>
                    )}

                    {mayManage && !row.approved && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditing(editing === row.id ? null : row.id)
                        }
                        className="ml-2 text-xs text-accent hover:underline"
                      >
                        Fix
                      </button>
                    )}
                    {mayApprove && row.approved && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await withdrawTimeApprovalAction(row.id);
                            router.refresh();
                          })
                        }
                        className="ml-2 text-xs text-accent hover:underline disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>

                {editing === row.id && (
                  <tr>
                    <td colSpan={mayApprove ? 8 : 7} className="px-3 pb-3">
                      <CorrectEntry
                        row={row}
                        onDone={() => {
                          setEditing(null);
                          router.refresh();
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {mayApprove && approvable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
          <span className="text-sm text-muted">
            {chosen.length > 0
              ? `${chosen.length} selected`
              : `${approvable.length} awaiting sign-off`}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const ids = chosen.length > 0 ? chosen : approvable.map((row) => row.id);
                const result = await approveTimeEntriesAction(ids);
                if (!result.ok) setMessage(result.message ?? "That did not work.");
                setChosen([]);
                router.refresh();
              })
            }
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {chosen.length > 0 ? `Sign off ${chosen.length}` : "Sign off the lot"}
          </button>
          <span className="text-xs text-faint">
            Nothing is paid from an entry nobody has signed.
          </span>
        </div>
      )}
    </div>
  );
}

function CorrectEntry({ row, onDone }: { row: Row; onDone: () => void }) {
  const [clockedInAt, setClockedInAt] = useState(row.clockedInAt.slice(0, 16));
  const [clockedOutAt, setClockedOutAt] = useState(
    row.clockedOutAt?.slice(0, 16) ?? "",
  );
  const [breakMinutes, setBreakMinutes] = useState(row.breakMinutes);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2 rounded-[10px] border border-border bg-surface-muted p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Clocked in
          </span>
          <input
            type="datetime-local"
            value={clockedInAt}
            onChange={(event) => setClockedInAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Clocked out
          </span>
          <input
            type="datetime-local"
            value={clockedOutAt}
            onChange={(event) => setClockedOutAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Break (min)
          </span>
          <input
            value={String(breakMinutes)}
            inputMode="numeric"
            onChange={(event) =>
              setBreakMinutes(Number(event.target.value.replace(/\D/g, "")) || 0)
            }
            className={inputClass}
          />
        </label>
      </div>

      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="What was wrong with it — forgot to clock out, wrong site, phone flat"
        className={inputClass}
      />

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <button
        type="button"
        disabled={pending || reason.trim().length < 3}
        onClick={() =>
          startTransition(async () => {
            const result = await correctTimeEntryAction({
              entryId: row.id,
              // The input has no timezone; the rest of the system works in UTC.
              clockedInAt: `${clockedInAt}:00Z`,
              clockedOutAt: clockedOutAt ? `${clockedOutAt}:00Z` : null,
              breakMinutes,
              reason,
            });
            if (!result.ok) {
              setMessage(result.message ?? "That did not work.");
              return;
            }
            onDone();
          })
        }
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Correct it"}
      </button>
    </div>
  );
}
