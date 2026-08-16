import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { asHours } from "./payroll";

/**
 * The pay period as a sheet of paper.
 *
 * The CSV is for the payroll package; this is for the human being who signs
 * the pay run off, and for the file it gets kept in afterwards. Those are
 * different documents and pretending one can be both produces a spreadsheet
 * nobody can read and a report no software can import.
 *
 * Drawn rather than rendered from HTML. Turning a page into a PDF means either
 * shipping a headless browser into a serverless function — tens of megabytes,
 * a cold start measured in seconds — or laying it out by hand. For a table
 * with seven columns the hand-drawn version is a couple of hundred lines and
 * has no runtime to go wrong.
 *
 * No money on it, for the same reason there is none anywhere else: the system
 * holds no pay rates. The multipliers are printed so whoever reads it knows
 * what each column is worth, and the arithmetic happens in the payroll package.
 */

export interface PdfRow {
  employeeNumber: string;
  name: string;
  department: string | null;
  ordinary: number;
  overtime: number;
  sunday: number;
  holiday: number;
  total: number;
  unsignedMinutes: number;
  breaches: number;
}

export interface PdfInput {
  organisation: string;
  from: string;
  to: string;
  rows: PdfRow[];
  totals: {
    ordinary: number;
    overtime: number;
    sunday: number;
    holiday: number;
    unsignedEntries: number;
    runningEntries: number;
  };
  multipliers: { overtime: number; sunday: number; holiday: number };
  preparedBy: string;
}

/** A4 in points, portrait. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const INK = rgb(0.1, 0.1, 0.1);
const FAINT = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.85, 0.85, 0.85);
const WARN = rgb(0.7, 0.35, 0.05);

/** Column x positions. Numbers are right-aligned to the value in this list. */
const COLUMNS = {
  person: MARGIN,
  ordinary: 320,
  overtime: 375,
  sunday: 428,
  holiday: 481,
  total: 555,
} as const;

export async function payrollPdf(input: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Payroll ${input.from} to ${input.to} — ${input.organisation}`);
  pdf.setSubject("Hours worked, split by what each is paid at");
  pdf.setProducer("Nopedi Business Operating System");
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const text = (
    value: string,
    x: number,
    size = 9,
    font = regular,
    color = INK,
  ) => page.drawText(value, { x, y, size, font, color });

  /** Right-aligns a number on a column edge, which is how figures are read. */
  const rightText = (value: string, right: number, size = 9, font = regular) =>
    page.drawText(value, {
      x: right - font.widthOfTextAtSize(value, size),
      y,
      size,
      font,
      color: INK,
    });

  /**
   * A rule on the current baseline.
   *
   * Drawn at `y` rather than above it, because text sits *on* its baseline:
   * a line a few points higher goes through the words rather than under them.
   */
  const rule = () =>
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE.width - MARGIN, y },
      thickness: 0.5,
      color: RULE,
    });

  function header() {
    y = PAGE.height - MARGIN;
    text(input.organisation, MARGIN, 16, bold);
    y -= 18;
    text(`Payroll — hours worked, ${input.from} to ${input.to}`, MARGIN, 11);
    y -= 14;
    text(
      `Prepared by ${input.preparedBy} on ${new Date().toISOString().slice(0, 10)}. Signed-off hours only.`,
      MARGIN,
      8,
      regular,
      FAINT,
    );
    y -= 26;
  }

  function columnHeadings() {
    text("Person", COLUMNS.person, 8, bold, FAINT);
    rightText("Ordinary", COLUMNS.ordinary, 8, bold);
    rightText(`OT ×${input.multipliers.overtime}`, COLUMNS.overtime, 8, bold);
    rightText(`Sun ×${input.multipliers.sunday}`, COLUMNS.sunday, 8, bold);
    rightText(`Hol ×${input.multipliers.holiday}`, COLUMNS.holiday, 8, bold);
    rightText("Total", COLUMNS.total, 8, bold);
    y -= 8;
    rule();
    y -= 16;
  }

  header();
  columnHeadings();

  for (const row of input.rows) {
    // A new page when the next row and its second line would not fit, so a
    // person's number never lands on a different page from their name.
    if (y < MARGIN + 60) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      header();
      columnHeadings();
    }

    text(row.name, COLUMNS.person, 10, bold);
    rightText(String(asHours(row.ordinary)), COLUMNS.ordinary, 10);
    rightText(row.overtime > 0 ? String(asHours(row.overtime)) : "—", COLUMNS.overtime, 10);
    rightText(row.sunday > 0 ? String(asHours(row.sunday)) : "—", COLUMNS.sunday, 10);
    rightText(row.holiday > 0 ? String(asHours(row.holiday)) : "—", COLUMNS.holiday, 10);
    rightText(String(asHours(row.total)), COLUMNS.total, 10, bold);

    y -= 11;
    const beneath = [row.employeeNumber, row.department].filter(Boolean).join("  ·  ");
    text(beneath, COLUMNS.person, 8, regular, FAINT);

    const notes: string[] = [];
    if (row.unsignedMinutes > 0) {
      notes.push(`${asHours(row.unsignedMinutes)}h not signed off — not included`);
    }
    if (row.breaches > 0) {
      notes.push(
        `${row.breaches} ${row.breaches === 1 ? "day" : "days"} over the BCEA overtime limit`,
      );
    }
    if (notes.length > 0) {
      y -= 10;
      text(notes.join("  ·  "), COLUMNS.person, 8, regular, WARN);
    }

    y -= 16;
  }

  // The totals line, which is the number somebody checks against the bank run.
  y -= 4;
  rule();
  y -= 16;
  text("Total", COLUMNS.person, 10, bold);
  rightText(String(asHours(input.totals.ordinary)), COLUMNS.ordinary, 10, bold);
  rightText(String(asHours(input.totals.overtime)), COLUMNS.overtime, 10, bold);
  rightText(String(asHours(input.totals.sunday)), COLUMNS.sunday, 10, bold);
  rightText(String(asHours(input.totals.holiday)), COLUMNS.holiday, 10, bold);
  rightText(
    String(
      asHours(
        input.totals.ordinary +
          input.totals.overtime +
          input.totals.sunday +
          input.totals.holiday,
      ),
    ),
    COLUMNS.total,
    10,
    bold,
  );

  y -= 26;
  if (input.totals.unsignedEntries > 0 || input.totals.runningEntries > 0) {
    const parts: string[] = [];
    if (input.totals.unsignedEntries > 0) {
      const one = input.totals.unsignedEntries === 1;
      parts.push(
        `${input.totals.unsignedEntries} ${one ? "entry is" : "entries are"} not signed off`,
      );
    }
    if (input.totals.runningEntries > 0) {
      const one = input.totals.runningEntries === 1;
      parts.push(`${input.totals.runningEntries} ${one ? "is" : "are"} still running`);
    }
    text(
      `${parts.join(" and ")}. None of them are in these figures.`,
      MARGIN,
      9,
      bold,
      WARN,
    );
    y -= 16;
  }

  text(
    "Hours only. The multipliers above are what each column is worth; the payroll system holds the rates.",
    MARGIN,
    8,
    regular,
    FAINT,
  );
  y -= 34;

  // Somewhere to sign, because this is the copy that gets filed.
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 180, y },
    thickness: 0.5,
    color: RULE,
  });
  page.drawLine({
    start: { x: MARGIN + 220, y },
    end: { x: MARGIN + 340, y },
    thickness: 0.5,
    color: RULE,
  });
  y -= 11;
  text("Approved for payment", MARGIN, 8, regular, FAINT);
  text("Date", MARGIN + 220, 8, regular, FAINT);

  return pdf.save();
}
