import { notFound, redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { db } from "@/lib/database/client";
import { hrService } from "@/modules/hr/hr.service";
import { NotFoundError } from "@/lib/errors";
import { PageHeader } from "@/components/ui";
import { EditEmployeeForm } from "./edit-form";

/** Correcting a record: a transfer, a promotion, a new phone number. */

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.employee.edit")) return "forbidden" as const;

    try {
      const employee = await hrService.getEmployee(id);

      return {
        employee,
        /*
         * Anyone but themselves. A cycle further up the chain is still
         * possible and is caught in the service; this only removes the one
         * case the screen can see, because offering somebody their own name
         * in their own "reports to" list is just untidy.
         */
        managers: (await hrService.listEmployees(["ACTIVE", "ON_LEAVE"]))
          .filter((candidate) => candidate.id !== id)
          .map((candidate) => ({
            value: candidate.id,
            label: `${candidate.firstName} ${candidate.lastName}`,
          })),
        /** Free logins, plus the one this person already holds. */
        users: (
          await db.user.findMany({
            where: {
              isActive: true,
              OR: [{ employeeRecord: null }, { id: employee.userId ?? undefined }],
            },
            select: { id: true, firstName: true, lastName: true, email: true },
            orderBy: { firstName: "asc" },
          })
        ).map((user) => ({
          value: user.id,
          label: `${user.firstName} ${user.lastName} (${user.email})`,
        })),
        workPatterns: (await hrService.listWorkPatterns()).map((pattern) => ({
          value: pattern.id,
          label: pattern.isDefault ? `${pattern.name} (default)` : pattern.name,
        })),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

  if (data === "forbidden") redirect(`/hr/employees/${id}`);
  if (!data) notFound();

  const { employee } = data;

  return (
    <>
      <PageHeader
        title={`Edit ${employee.firstName} ${employee.lastName}`}
        description={`${employee.employeeNumber} · changes are audited`}
      />
      <EditEmployeeForm
        employee={{
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email ?? "",
          phone: employee.phone ?? "",
          nationalId: employee.nationalId ?? "",
          jobTitle: employee.jobTitle ?? "",
          department: employee.department ?? "",
          managerId: employee.managerId ?? "",
          userId: employee.userId ?? "",
          employmentType: employee.employmentType,
          status: employee.status,
          startedAt: employee.startedAt.toISOString().slice(0, 10),
          workPatternId: employee.workPatternId ?? "",
        }}
        managers={data.managers}
        users={data.users}
        workPatterns={data.workPatterns}
      />
    </>
  );
}
