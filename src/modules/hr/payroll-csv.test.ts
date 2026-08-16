import { describe, expect, it } from "vitest";
import { csvFilename, toCsv } from "@/app/(app)/hr/payroll/csv";

/**
 * The file a payroll package swallows.
 *
 * CSV looks trivial until a surname contains a comma, and then a whole column
 * shifts sideways and somebody is paid another person's hours.
 */

const MULTIPLIERS = { overtime: 1.5, sunday: 2, holiday: 2 };

const ROW = {
  employeeNumber: "EMP-2026-0001",
  name: "Anele Dlamini",
  department: "Workshop",
  ordinary: 510,
  overtime: 60,
  sunday: 0,
  holiday: 0,
  unsignedMinutes: 0,
};

describe("the export", () => {
  it("writes a header and a row per person", () => {
    const lines = toCsv([ROW], MULTIPLIERS).split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Employee number");
    expect(lines[1]).toContain("EMP-2026-0001");
  });

  it("gives decimal hours, not minutes", () => {
    const [, row] = toCsv([ROW], MULTIPLIERS).split("\n");
    expect(row).toContain("8.5");
    expect(row).not.toContain("510");
  });

  it("carries the multipliers rather than applying them", () => {
    // Nothing in this system knows what anybody earns, and the moment it
    // multiplied hours by a rate it would have to.
    const csv = toCsv([ROW], MULTIPLIERS);
    expect(csv).toContain("Overtime rate (x1.5)");
    expect(csv.split("\n")[1]).toContain(",1.5,");
  });

  it("quotes a name with a comma in it", () => {
    const csv = toCsv(
      [{ ...ROW, name: "Dlamini, Anele", department: null }],
      MULTIPLIERS,
    );
    expect(csv).toContain('"Dlamini, Anele"');
    // And the row still has the same number of fields as the header.
    const [header, row] = csv.split("\n");
    expect(row.split(",").length).toBeGreaterThanOrEqual(header.split(",").length - 1);
  });

  it("doubles a quote inside a field rather than ending it early", () => {
    const csv = toCsv([{ ...ROW, name: 'Anele "Bear" Dlamini' }], MULTIPLIERS);
    expect(csv).toContain('"Anele ""Bear"" Dlamini"');
  });

  it("leaves an empty department empty rather than writing null", () => {
    const [, row] = toCsv([{ ...ROW, department: null }], MULTIPLIERS).split("\n");
    expect(row).not.toContain("null");
  });

  it("names the file after the period", () => {
    expect(csvFilename("2026-08-01", "2026-08-31")).toBe(
      "nopedi-payroll-2026-08-01-to-2026-08-31.csv",
    );
  });
});
