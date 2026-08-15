"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormAction } from "@/components/forms";
import { Icon } from "@/components/ui";
import { assignToRosterAction, removeAssignmentAction } from "../actions";

/**
 * The week grid.
 *
 * People down, days across. Every cell is one of four things and they have to
 * be distinguishable without reading: placed, on leave, due in but unplaced,
 * or not a working day at all. The last is the one that matters most and is
 * easiest to get wrong — a Sunday, a public holiday and the off week of a
 * rotation all render as struck through, so nobody plans a crew onto a day
 * that was never available.
 */

interface Assignment {
  id: string;
  projectId: string | null;
  projectName: string | null;
  startsAt: string;
  endsAt: string;
  note: string | null;
}

interface Leave {
  id: string;
  status: string;
  leaveTypeName: string;
  startsAt: string;
  endsAt: string;
}

export interface RosterPerson {
  id: string;
  name: string;
  jobTitle: string | null;
  workingDays: string[];
  assignments: Assignment[];
  leave: Leave[];
}

interface Choice {
  value: string;
  label: string;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function covers(range: { startsAt: string; endsAt: string }, day: string): boolean {
  return range.startsAt <= day && range.endsAt >= day;
}

export function WeekNav({
  from,
  projectId,
  projects,
}: {
  from: string;
  projectId: string;
  projects: Choice[];
}) {
  const router = useRouter();

  function go(weekStart: string, project: string) {
    const query = new URLSearchParams({ week: weekStart });
    if (project) query.set("project", project);
    router.push(`/hr/roster?${query.toString()}`);
  }

  function shift(weeks: number): string {
    const day = new Date(`${from}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + weeks * 7);
    return day.toISOString().slice(0, 10);
  }

  return (
    <span className="flex items-center gap-2">
      <select
        value={projectId}
        onChange={(event) => go(from, event.target.value)}
        className="h-9 rounded-[10px] border border-border bg-surface px-2.5 text-sm outline-none focus:border-accent"
      >
        <option value="">Every site</option>
        {projects.map((project) => (
          <option key={project.value} value={project.value}>
            {project.label}
          </option>
        ))}
      </select>

      <span className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => go(shift(-1), projectId)}
          className="grid size-9 place-items-center rounded-[10px] border border-border bg-surface transition hover:bg-surface-muted"
        >
          <Icon name="chevronRight" size={16} className="rotate-180" />
        </button>
        <button
          type="button"
          onClick={() => go(new Date().toISOString().slice(0, 10), projectId)}
          className="h-9 rounded-[10px] border border-border bg-surface px-3 text-sm font-medium transition hover:bg-surface-muted"
        >
          This week
        </button>
        <button
          type="button"
          aria-label="Next week"
          onClick={() => go(shift(1), projectId)}
          className="grid size-9 place-items-center rounded-[10px] border border-border bg-surface transition hover:bg-surface-muted"
        >
          <Icon name="chevronRight" size={16} />
        </button>
      </span>
    </span>
  );
}

export function RosterGrid({
  days,
  people,
  projects,
  mayManage,
}: {
  days: string[];
  people: RosterPerson[];
  projects: Choice[];
  mayManage: boolean;
}) {
  const router = useRouter();
  const [placing, setPlacing] = useState<{ person: RosterPerson; day: string } | null>(
    null,
  );
  const [removing, startRemoving] = useTransition();

  return (
    <>
      {/* The grid is wider than a phone; it scrolls inside the card. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="w-48 px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-faint">
                Person
              </th>
              {days.map((day, index) => (
                <th
                  key={day}
                  className="px-1 py-2 text-center text-[11px] font-medium text-faint"
                >
                  {DAY_NAMES[index]}
                  <span className="tabular ml-1 text-foreground">
                    {Number(day.slice(8, 10))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {people.map((person) => (
              <tr key={person.id} className="border-b border-border last:border-0">
                <td className="px-5 py-2">
                  <span className="block text-sm font-medium">{person.name}</span>
                  {person.jobTitle && (
                    <span className="block text-xs text-faint">{person.jobTitle}</span>
                  )}
                </td>

                {days.map((day) => {
                  const working = person.workingDays.includes(day);
                  const leave = person.leave.find((request) => covers(request, day));
                  const assignment = person.assignments.find((placement) =>
                    covers(placement, day),
                  );

                  if (!working) {
                    return (
                      <td key={day} className="px-1 py-2 text-center align-middle">
                        <span
                          className="mx-auto block h-8 rounded-lg bg-canvas"
                          title="Not a working day"
                        />
                      </td>
                    );
                  }

                  if (leave) {
                    return (
                      <td key={day} className="px-1 py-2 text-center align-middle">
                        <span
                          className={`mx-auto flex h-8 items-center justify-center rounded-lg px-1 text-[11px] font-medium ${
                            leave.status === "APPROVED"
                              ? "bg-warning-soft text-warning"
                              : "border border-dashed border-border text-muted"
                          }`}
                          title={`${leave.leaveTypeName} — ${leave.status.toLowerCase()}`}
                        >
                          Leave
                        </span>
                      </td>
                    );
                  }

                  if (assignment) {
                    return (
                      <td key={day} className="px-1 py-2 text-center align-middle">
                        <button
                          type="button"
                          disabled={!mayManage || removing}
                          onClick={() =>
                            startRemoving(async () => {
                              const result = await removeAssignmentAction(assignment.id);
                              if (result.ok) router.refresh();
                            })
                          }
                          title={
                            mayManage
                              ? `${assignment.projectName ?? "Unassigned"} — click to remove`
                              : (assignment.projectName ?? "Unassigned")
                          }
                          className="mx-auto flex h-8 w-full items-center justify-center truncate rounded-lg bg-accent px-1.5 text-[11px] font-medium text-accent-foreground transition disabled:cursor-default hover:enabled:opacity-90"
                        >
                          {assignment.projectName ?? "Yard"}
                        </button>
                      </td>
                    );
                  }

                  return (
                    <td key={day} className="px-1 py-2 text-center align-middle">
                      <button
                        type="button"
                        disabled={!mayManage}
                        onClick={() => setPlacing({ person, day })}
                        title={mayManage ? "Place on a site" : "Not placed"}
                        className="mx-auto flex h-8 w-full items-center justify-center rounded-lg border border-dashed border-border text-faint transition hover:enabled:border-accent hover:enabled:text-accent disabled:cursor-default"
                      >
                        {mayManage ? "+" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Legend />

      {placing && (
        <PlaceDialog
          person={placing.person}
          day={placing.day}
          projects={projects}
          onClose={() => setPlacing(null)}
        />
      )}
    </>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-3 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded bg-accent" /> Placed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded bg-warning-soft" /> On leave
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded border border-dashed border-border" /> Due in,
        unplaced
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded bg-canvas" /> Not a working day
      </span>
    </div>
  );
}

/** Placing somebody: which site, and for how long. */
function PlaceDialog({
  person,
  day,
  projects,
  onClose,
}: {
  person: RosterPerson;
  day: string;
  projects: Choice[];
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.value ?? "");
  const [endsAt, setEndsAt] = useState(day);
  const [note, setNote] = useState("");
  const { pending, message, submit } = useFormAction(onClose);

  const inputClass =
    "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

  return (
    <div className="border-t border-border bg-surface-muted px-5 py-4">
      <p className="text-sm font-medium">
        Place {person.name} from{" "}
        <span className="tabular">{day}</span>
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className={inputClass}
        >
          <option value="">No site — yard or training</option>
          {projects.map((project) => (
            <option key={project.value} value={project.value}>
              {project.label}
            </option>
          ))}
        </select>
        <label className="block">
          <input
            type="date"
            value={endsAt}
            min={day}
            onChange={(event) => setEndsAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note — night shift, standby…"
          className={inputClass}
        />
      </div>

      {message && (
        <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending || !endsAt}
          onClick={() =>
            submit(() =>
              assignToRosterAction({
                employeeId: person.id,
                projectId: projectId || null,
                startsAt: day,
                endsAt,
                note: note || undefined,
              }),
            )
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Placing…" : "Place"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
