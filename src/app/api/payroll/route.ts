import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { isoDate } from "@/modules/hr/public-holidays";
import { csvFilename, toCsv } from "@/app/(app)/hr/payroll/csv";

/**
 * The pay period, downloaded.
 *
 * A route handler rather than a server action because the browser has to be
 * handed a file: an action returns data to React, and turning that back into a
 * download means building a blob in the client and hoping the browser agrees.
 * A GET with a Content-Disposition header is what the platform is for.
 *
 * The permission is checked by the service, exactly as on the screen — a URL
 * anybody can type is precisely why the check does not live in the page.
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
    const period = await withSession(() => hrService.payrollFor(from, to));

    const csv = toCsv(
      period.people.map((person) => ({
        employeeNumber: person.employeeNumber,
        name: person.name,
        department: person.department,
        ordinary: person.ordinary,
        overtime: person.overtime,
        sunday: person.sunday,
        holiday: person.holiday,
        unsignedMinutes: person.unsignedMinutes,
      })),
      {
        overtime: period.policy.overtimeMultiplier,
        sunday: period.policy.sundayMultiplier,
        holiday: period.policy.holidayMultiplier,
      },
    );

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${csvFilename(
          isoDate(period.from),
          isoDate(period.to),
        )}"`,
        // A pay run is per tenant and per person. Nothing caches it.
        "cache-control": "no-store",
      },
    });
  } catch {
    /*
     * Deliberately terse. This endpoint is reachable by typing a URL, and the
     * difference between "you may not" and "there is nothing there" is itself
     * worth something to somebody guessing.
     */
    return new Response("Not available.", { status: 403 });
  }
}
