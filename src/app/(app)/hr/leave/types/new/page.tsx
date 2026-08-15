import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { BLANK_LEAVE_TYPE, LeaveTypeForm } from "../leave-type-form";

/** Adding a kind of leave. */

export default async function NewLeaveTypePage() {
  const allowed = await withSession(async (session) =>
    session.permissions.has("hr.leave.configure"),
  );
  if (!allowed) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="New leave type"
        description="Entitlement, and how it reaches somebody's balance"
      />
      <LeaveTypeForm initial={BLANK_LEAVE_TYPE} />
    </>
  );
}
