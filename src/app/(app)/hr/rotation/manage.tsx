"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import {
  applyDueTurnsAction,
  assignPatternsAction,
  cancelTurnAction,
} from "../actions";

/**
 * Assigning a pattern to a crew.
 *
 * A table with checkboxes rather than a form per person, because the decision
 * being recorded is about a group: the night crew changes together, and asking
 * for it eighteen times is how a roster ends up half-updated.
 *
 * The fairness figure sits in the row it is about — how many turns running
 * this person has had, against what the pattern says is too many. Putting it
 * anywhere else would make it a report somebody opens once, when the moment it
 * matters is while a foreman is deciding who to tick.
 */

interface PatternChoice {
  id: string;
  name: string;
  days: string;
  shiftName: string | null;
  rotationWeeks: number | null;
  maxConsecutiveTurns: number | null;
}

interface ShiftChoice {
  id: string;
  label: string;
}

export interface Row {
  id: string;
  name: string;
  employeeNumber: string;
  jobTitle: string | null;
  department: string | null;
  patternName: string | null;
  onDefaultPattern: boolean;
  shiftName: string | null;
  since: string | null;
  until: string | null;
  turns: number;
  limit: number | null;
  concern: string | null;
  next: {
    id: string;
    startsOn: string;
    endsOn: string | null;
    patternName: string;
    shiftName: string | null;
    due: boolean;
  } | null;
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RotationBoard({
  rows,
  patterns,
  shifts,
  mayManage,
}: {
  rows: Row[];
  patterns: PatternChoice[];
  shifts: ShiftChoice[];
  mayManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [chosen, setChosen] = useState<string[]>([]);
  const [department, setDepartment] = useState("");
  const [patternFilter, setPatternFilter] = useState("");

  const [patternId, setPatternId] = useState(patterns[0]?.id ?? "");
  const [shiftId, setShiftId] = useState("");
  const [startsOn, setStartsOn] = useState(todayIso());
  const [weeks, setWeeks] = useState<number | null>(
    patterns[0]?.rotationWeeks ?? null,
  );
  const [note, setNote] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{
    assigned: number;
    takesEffectNow: boolean;
    concerns: string[];
  } | null>(null);

  const departments = useMemo(
    () =>
      [...new Set(rows.map((row) => row.department).filter(Boolean))].sort() as string[],
    [rows],
  );

  const shown = rows.filter(
    (row) =>
      (!department || row.department === department) &&
      (!patternFilter || row.patternName === patternFilter),
  );

  const patternNames = useMemo(
    () =>
      [...new Set(rows.map((row) => row.patternName).filter(Boolean))].sort() as string[],
    [rows],
  );

  const due = rows.filter((row) => row.next?.due);
  const allShown = shown.length > 0 && shown.every((row) => chosen.includes(row.id));

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    );
  }

  const pattern = patterns.find((row) => row.id === patternId);

  /*
   * The warning before it is written, from the numbers already on screen.
   * Everybody selected who would be at or past the chosen pattern's limit once
   * this turn is added. The service recomputes it from the database and its
   * answer is the one that gets reported — this is the courtesy of showing it
   * while there is still a choice to make.
   */
  const wouldWarn = pattern?.maxConsecutiveTurns
    ? shown.filter(
        (row) =>
          chosen.includes(row.id) &&
          row.patternName === pattern.name &&
          row.turns + 1 >= (pattern.maxConsecutiveTurns ?? Infinity),
      )
    : [];

  function apply() {
    setMessage(null);
    setOutcome(null);
    startTransition(async () => {
      const result = await assignPatternsAction({
        employeeIds: chosen,
        workPatternId: patternId,
        shiftId: shiftId || null,
        startsOn,
        weeks,
        note: note || undefined,
      });

      if (!result.ok) {
        setMessage(result.message ?? "That did not work.");
        return;
      }

      setOutcome({
        assigned: result.assigned ?? 0,
        takesEffectNow: result.takesEffectNow ?? false,
        concerns: result.concerns ?? [],
      });
      setChosen([]);
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {mayManage && due.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-warning/40 bg-warning-soft px-4 py-3">
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              {due.length} {due.length === 1 ? "turn has" : "turns have"} started
              without taking effect.
            </span>{" "}
            <span className="text-muted">
              The overnight run has not happened yet. Applying them now points
              each person at the pattern their turn says they are on.
            </span>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await applyDueTurnsAction();
                if (!result.ok) setMessage(result.message ?? "That did not work.");
                router.refresh();
              })
            }
            className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-50"
          >
            Apply now
          </button>
        </div>
      )}

      {outcome && (
        <div className="space-y-2 rounded-[14px] border border-border bg-surface-muted px-4 py-3">
          <p className="text-sm font-medium">
            {outcome.assigned} {outcome.assigned === 1 ? "person" : "people"}{" "}
            assigned
            {outcome.takesEffectNow ? " — in force now." : " — starting later."}
          </p>
          {outcome.concerns.map((concern) => (
            <p key={concern} className="text-sm text-warning">
              {concern}
            </p>
          ))}
          {outcome.concerns.length > 0 && (
            <p className="text-xs text-muted">
              Recorded either way. Nothing here was blocked — the point is that
              somebody sees it.
            </p>
          )}
        </div>
      )}

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Department
          </span>
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className={`${inputClass} min-w-40`}
          >
            <option value="">Everyone</option>
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            On pattern
          </span>
          <select
            value={patternFilter}
            onChange={(event) => setPatternFilter(event.target.value)}
            className={`${inputClass} min-w-40`}
          >
            <option value="">Any</option>
            {patternNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {mayManage && (
          <button
            type="button"
            onClick={() =>
              setChosen(allShown ? [] : [...new Set([...chosen, ...shown.map((row) => row.id)])])
            }
            className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
          >
            {allShown ? "Clear these" : `Select these ${shown.length}`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-border">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              {mayManage && <th className="w-10 px-3 py-2" />}
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">Working now</th>
              {mayManage && (
                <th className="px-3 py-2 font-medium">Turns running</th>
              )}
              <th className="px-3 py-2 font-medium">Next</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((row) => {
              const picked = chosen.includes(row.id);
              return (
                <tr
                  key={row.id}
                  className={picked ? "bg-accent-soft/40" : undefined}
                >
                  {mayManage && (
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => toggle(row.id)}
                        aria-label={`Select ${row.name}`}
                        className="size-4 accent-[var(--accent)]"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 align-top">
                    <span className="block font-medium">{row.name}</span>
                    <span className="block text-xs text-faint">
                      {row.jobTitle ?? "—"}
                      {row.department ? ` · ${row.department}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="block">
                      {row.patternName ?? "No pattern set"}
                      {row.onDefaultPattern && row.patternName && (
                        <span className="ml-1.5 text-xs text-faint">default</span>
                      )}
                    </span>
                    <span className="block text-xs text-faint">
                      {row.shiftName ?? "No set hours"}
                      {row.since ? ` · since ${shortDate(row.since)}` : ""}
                      {row.until ? ` · until ${shortDate(row.until)}` : ""}
                    </span>
                  </td>
                  {mayManage && (
                    <td className="px-3 py-2 align-top">
                      {row.limit === null ? (
                        <span className="text-xs text-faint">Not watched</span>
                      ) : (
                        <span className="tabular text-sm">
                          {row.turns} of {row.limit}
                          {row.concern && (
                            <span className="ml-2">
                              <Badge tone="warning">Too many</Badge>
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 align-top">
                    {row.next ? (
                      <span className="block text-xs">
                        <span className="block">
                          {row.next.patternName}
                          {row.next.shiftName ? ` · ${row.next.shiftName}` : ""}
                        </span>
                        <span className="block text-faint">
                          from {shortDate(row.next.startsOn)}
                          {row.next.endsOn ? ` to ${shortDate(row.next.endsOn)}` : ""}
                          {row.next.due ? " · due" : ""}
                        </span>
                        {mayManage && !row.next.due && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const id = row.next?.id;
                                if (!id) return;
                                const result = await cancelTurnAction(id);
                                if (!result.ok) {
                                  setMessage(result.message ?? "That did not work.");
                                }
                                router.refresh();
                              })
                            }
                            className="mt-0.5 text-xs text-accent hover:underline disabled:opacity-50"
                          >
                            Call it off
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mayManage && chosen.length > 0 && (
        <div className="space-y-3 rounded-[14px] border border-accent/40 bg-surface p-4">
          <p className="text-sm font-medium">
            {chosen.length} selected
          </p>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
                Pattern
              </span>
              <select
                value={patternId}
                onChange={(event) => {
                  setPatternId(event.target.value);
                  const next = patterns.find((row) => row.id === event.target.value);
                  // The pattern's own rotation length is the sensible default
                  // for how long this turn runs, and still editable below.
                  setWeeks(next?.rotationWeeks ?? null);
                }}
                className={inputClass}
              >
                {patterns.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} — {row.days}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
                Shift
              </span>
              <select
                value={shiftId}
                onChange={(event) => setShiftId(event.target.value)}
                className={inputClass}
              >
                <option value="">
                  {pattern?.shiftName
                    ? `Pattern's own — ${pattern.shiftName}`
                    : "Pattern's own hours"}
                </option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
                Starts
              </span>
              <input
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
                Runs for
              </span>
              <select
                value={weeks === null ? "" : String(weeks)}
                onChange={(event) =>
                  setWeeks(event.target.value ? Number(event.target.value) : null)
                }
                className={inputClass}
              >
                <option value="">Until it changes</option>
                {[1, 2, 3, 4, 6, 8, 12, 26].map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? "week" : "weeks"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note — covering leave, ticket expiring, whatever explains it"
            className={inputClass}
          />

          {wouldWarn.length > 0 && (
            <div className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
              <span className="font-medium">
                {wouldWarn.length === 1
                  ? `${wouldWarn[0].name} has already had this pattern ${wouldWarn[0].turns} turns running.`
                  : `${wouldWarn.length} of these have already had this pattern too many turns running.`}
              </span>{" "}
              You can go ahead — it will be recorded and reported, not refused.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !patternId || !startsOn}
              onClick={apply}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Assigning…" : `Assign ${chosen.length}`}
            </button>
            <button
              type="button"
              onClick={() => setChosen([])}
              className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
