import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { payrollPdf } from "@/modules/hr/payroll-pdf";
import { isoDate } from "@/modules/hr/public-holidays";

/**
 * The pay period, printable.
 *
 * The same figures as the CSV beside it, laid out for a person rather than for
 * an importer — the copy somebody signs and files. A route handler for the
 * same reason: the browser has to be handed a file, and that is what
 * Content-Disposition is for.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = new Date(`${url.searchParams.get("from") ?? ""}T00:00:00.000Z`);
  const to = new Date(`${url.searchParams.get("to") ?? ""}T00:00:00.000Z`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return new Response("Give a from and a to date, as YYYY-MM-DD.", {
      status: 400,
    });
  }

  try {
    const { period, organisation, preparedBy } = await withSession(
      async (session) => ({
        period: await hrService.payrollFor(from, to),
        organisation: session.organisationName,
        preparedBy: session.fullName,
      }),
    );

    const bytes = await payrollPdf({
      organisation,
      preparedBy,
      from: isoDate(period.from),
      to: isoDate(period.to),
      rows: period.people.map((person) => ({
        employeeNumber: person.employeeNumber,
        name: person.name,
        department: person.department,
        ordinary: person.ordinary,
        overtime: person.overtime,
        sunday: person.sunday,
        holiday: person.holiday,
        total: person.total,
        unsignedMinutes: person.unsignedMinutes,
        breaches: person.breaches.length,
      })),
      totals: period.totals,
      multipliers: {
        overtime: period.policy.overtimeMultiplier,
        sunday: period.policy.sundayMultiplier,
        holiday: period.policy.holidayMultiplier,
      },
    });

    return new Response(bytes as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        // `inline` rather than `attachment`: this one is meant to be looked at
        // and printed, and every browser's viewer has a print button on it.
        "content-disposition": `inline; filename="nopedi-payroll-${isoDate(
          period.from,
        )}-to-${isoDate(period.to)}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not available.", { status: 403 });
  }
}
