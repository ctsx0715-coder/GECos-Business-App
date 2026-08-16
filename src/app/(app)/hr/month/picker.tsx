"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Choosing whose month to look at.
 *
 * A select rather than a list of links, because the payroll is eighty people
 * and this control sits above the calendar rather than instead of it.
 */
export function PersonPicker({
  people,
  current,
}: {
  people: Array<{ id: string; name: string }>;
  current: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <select
      value={current}
      onChange={(event) => {
        const next = new URLSearchParams(params.toString());
        next.set("person", event.target.value);
        router.push(`/hr/month?${next.toString()}`);
      }}
      className="h-9 rounded-[10px] border border-border bg-surface px-2.5 text-sm outline-none focus:border-accent"
    >
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </select>
  );
}
