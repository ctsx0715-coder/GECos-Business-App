import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { db } from "@/lib/database/client";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "./employee-form";

/** Adding someone to the register. */

export default async function NewEmployeePage() {
  const data = await withSession(async (session) => {
    /*
     * Sent to the dashboard rather than the register: someone without create
     * permission often cannot see the register either, so bouncing them there
     * produces a second error instead of a graceful exit.
     */
    if (!session.permissions.has("hr.employee.create")) return null;

    return {
      managers: (await hrService.listEmployees(["ACTIVE", "ON_LEAVE"])).map(
        (employee) => ({
          value: employee.id,
          label: `${employee.firstName} ${employee.lastName}`,
        }),
      ),
      /** Logins not already claimed by an employee record. */
      users: (
        await db.user.findMany({
          where: { isActive: true, employeeRecord: null },
          select: { id: true, firstName: true, lastName: true, email: true },
          orderBy: { firstName: "asc" },
        })
      ).map((user) => ({
        value: user.id,
        label: `${user.firstName} ${user.lastName} (${user.email})`,
      })),
    };
  });

  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Add employee"
        description="Someone on the payroll, whether or not they ever sign in"
      />
      <EmployeeForm managers={data.managers} users={data.users} />
    </>
  );
}
