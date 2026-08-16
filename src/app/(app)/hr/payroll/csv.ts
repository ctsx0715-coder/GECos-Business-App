import { asHours } from "@/modules/hr/payroll";

/**
 * The pay period as a file a payroll package can swallow.
 *
 * CSV rather than anything cleverer because every South African payroll
 * package — VIP, Sage, SimplePay — imports CSV and none of them agree on
 * anything else. Hours per category per person, in decimal hours, which is the
 * one representation they all take.
 *
 * The multipliers ride along in their own columns rather than being applied
 * here. Nothing in this system knows what anybody earns, and the moment it
 * multiplies hours by a rate it would need to.
 */

export interface PayrollRow {
  employeeNumber: string;
  name: string;
  department: string | null;
  ordinary: number;
  overtime: number;
  sunday: number;
  holiday: number;
  unsignedMinutes: number;
}

/** Wraps a field only when it needs it, and doubles any quotes inside. */
function cell(value: string | number): string {
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(
  rows: PayrollRow[],
  multipliers: { overtime: number; sunday: number; holiday: number },
): string {
  const header = [
    "Employee number",
    "Name",
    "Department",
    "Ordinary hours",
    "Overtime hours",
    `Overtime rate (x${multipliers.overtime})`,
    "Sunday hours",
    `Sunday rate (x${multipliers.sunday})`,
    "Public holiday hours",
    `Public holiday rate (x${multipliers.holiday})`,
    "Unsigned hours (not included)",
  ];

  const body = rows.map((row) =>
    [
      row.employeeNumber,
      row.name,
      row.department ?? "",
      asHours(row.ordinary),
      asHours(row.overtime),
      multipliers.overtime,
      asHours(row.sunday),
      multipliers.sunday,
      asHours(row.holiday),
      multipliers.holiday,
      asHours(row.unsignedMinutes),
    ].map(cell),
  );

  return [header.map(cell), ...body].map((line) => line.join(",")).join("\n");
}

/** `nopedi-payroll-2026-08-01-to-2026-08-31.csv`. */
export function csvFilename(from: string, to: string): string {
  return `nopedi-payroll-${from}-to-${to}.csv`;
}
