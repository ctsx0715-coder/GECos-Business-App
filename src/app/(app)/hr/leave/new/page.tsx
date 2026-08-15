import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { PageHeader } from "@/components/ui";
import { LeaveForm } from "./leave-form";

/** Booking time off. */

export default async function NewLeavePage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.leave.request")) return null;

    const myEmployeeId = await hrService.myEmployeeId();
    const mayBookForOthers = session.permissions.has("hr.leave.configure");

    return {
      myEmployeeId,
      leaveTypes: (await hrService.listLeaveTypes()).map((type) => ({
        value: type.id,
        label: type.daysPerCycle === null ? `${type.name} (unpaid)` : type.name,
      })),
      balances: myEmployeeId ? await hrService.balancesFor(myEmployeeId) : [],
      /*
       * This year and next, which is as far ahead as anyone books. The form
       * counts with the same days the service will, so the preview and the
       * charge agree.
       */
      holidays: [
        ...(await hrService.holidayDatesBetween(
          new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
          new Date(Date.UTC(new Date().getUTCFullYear() + 1, 11, 31)),
        )),
      ],
      employees: mayBookForOthers
        ? (await hrService.listEmployees(["ACTIVE", "ON_LEAVE"])).map((e) => ({
            value: e.id,
            label: `${e.firstName} ${e.lastName}`,
          }))
        : [],
    };
  });

  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Request leave"
        description="Weekends and public holidays are not charged to leave"
      />
      <LeaveForm
        myEmployeeId={data.myEmployeeId}
        leaveTypes={data.leaveTypes}
        employees={data.employees}
        balances={data.balances}
        holidays={data.holidays}
      />
    </>
  );
}
