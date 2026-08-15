import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

/**
 * "My record" — the way in for somebody who is on the payroll but not in HR.
 *
 * A redirect rather than a second copy of the record screen, because it is the
 * same page: the permission rules already say your own record is yours to
 * read, and duplicating it would mean two screens to keep honest instead of
 * one. All this route knows is which employee you are.
 */

export default async function MyRecordPage() {
  const employeeId = await withSession(() => hrService.myEmployeeId());

  if (employeeId) redirect(`/hr/employees/${employeeId}`);

  return (
    <>
      <PageHeader
        title="My record"
        description="Your employment record, leave balances and certifications"
      />
      <Card>
        <CardHeader icon="users" title="Nothing linked to this login" />
        <EmptyState
          icon="users"
          title="No employee record is linked to your account"
          description="A login and a payroll record are separate things here, and yours have not been connected. HR can link them from the employee register."
        />
      </Card>
    </>
  );
}
