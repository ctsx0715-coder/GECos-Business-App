import { notFound, redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { NotFoundError } from "@/lib/errors";
import { PageHeader } from "@/components/ui";
import { LeaveTypeForm } from "../leave-type-form";

/** Editing a leave type. Policy changes are edits, not deployments. */

/** Decimal columns arrive as Prisma Decimals; the form speaks strings. */
function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(Number(value));
}

export default async function LeaveTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.leave.configure")) return "forbidden" as const;
    try {
      return { leaveType: await hrService.getLeaveType(id) };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

  if (data === "forbidden") redirect("/dashboard");
  if (!data) notFound();
  const { leaveType } = data;

  return (
    <>
      <PageHeader
        title={leaveType.name}
        description="What this leave is worth, and how it is credited"
      />
      <LeaveTypeForm
        initial={{
          id: leaveType.id,
          code: leaveType.code,
          name: leaveType.name,
          description: leaveType.description ?? "",
          daysPerCycle: text(leaveType.daysPerCycle),
          isPaid: leaveType.isPaid,
          carryOverMaxDays: text(leaveType.carryOverMaxDays),
          documentRequiredAfterDays:
            leaveType.documentRequiredAfterDays === null
              ? ""
              : String(leaveType.documentRequiredAfterDays),
          allowsBackdating: leaveType.allowsBackdating,
          accrualMethod: leaveType.accrualMethod,
          accrualDaysPerPeriod: text(leaveType.accrualDaysPerPeriod),
          sortOrder: String(leaveType.sortOrder),
          isActive: leaveType.isActive,
        }}
      />
    </>
  );
}
