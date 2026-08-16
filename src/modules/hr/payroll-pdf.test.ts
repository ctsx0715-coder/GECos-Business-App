import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { payrollPdf } from "./payroll-pdf";

/**
 * The printable copy.
 *
 * A PDF cannot be usefully asserted on line by line, so what is checked is
 * what would actually break: that it is a PDF at all, that a payroll of eighty
 * people does not silently lose the eightieth off the bottom of the page, and
 * that the document says whose it is when it is found in a filing cabinet two
 * years later.
 */

function aRow(name: string, overrides = {}) {
  return {
    employeeNumber: "EMP-2026-0001",
    name,
    department: "Workshop",
    ordinary: 540,
    overtime: 0,
    sunday: 0,
    holiday: 0,
    total: 540,
    unsignedMinutes: 0,
    breaches: 0,
    ...overrides,
  };
}

const INPUT = {
  organisation: "Nopedi Projects",
  preparedBy: "Refilwe Molefe",
  from: "2026-08-01",
  to: "2026-08-31",
  rows: [aRow("Anele Dlamini")],
  totals: {
    ordinary: 540,
    overtime: 0,
    sunday: 0,
    holiday: 0,
    unsignedEntries: 0,
    runningEntries: 0,
  },
  multipliers: { overtime: 1.5, sunday: 2, holiday: 2 },
};

describe("the printable pay period", () => {
  it("is a PDF", async () => {
    const bytes = await payrollPdf(INPUT);
    // Every PDF starts with this. If it does not, no viewer will open it.
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("says whose it is and what period, in the document itself", async () => {
    const pdf = await PDFDocument.load(await payrollPdf(INPUT));
    expect(pdf.getTitle()).toContain("Nopedi Projects");
    expect(pdf.getTitle()).toContain("2026-08-01");
  });

  it("fits one page for a small crew", async () => {
    const pdf = await PDFDocument.load(await payrollPdf(INPUT));
    expect(pdf.getPageCount()).toBe(1);
  });

  it("carries on to more pages rather than running off the bottom", async () => {
    const rows = Array.from({ length: 80 }, (_, index) =>
      aRow(`Person ${index + 1}`),
    );
    const pdf = await PDFDocument.load(await payrollPdf({ ...INPUT, rows }));

    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("draws a period with nobody in it rather than failing", async () => {
    // An empty month is a real thing to ask for — a site that has not started.
    const pdf = await PDFDocument.load(
      await payrollPdf({ ...INPUT, rows: [], totals: { ...INPUT.totals, ordinary: 0 } }),
    );
    expect(pdf.getPageCount()).toBe(1);
  });

  it("draws a row that has notes on it", async () => {
    const bytes = await payrollPdf({
      ...INPUT,
      rows: [aRow("Pieter van Wyk", { unsignedMinutes: 660, breaches: 2 })],
      totals: { ...INPUT.totals, unsignedEntries: 1, runningEntries: 1 },
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
