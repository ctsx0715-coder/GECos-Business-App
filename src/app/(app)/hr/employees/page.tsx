import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { headcount, expiringCertifications } from "@/lib/analytics/hr-metrics";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { formatDate, initials } from "@/lib/format";

/** The people register. */

const STATUS_TONES: Record<string, "neutral" | "accent" | "warning" | "danger"> = {
  ACTIVE: "accent",
  ON_LEAVE: "warning",
  SUSPENDED: "danger",
  EXITED: "neutral",
};

const STATUS_ICONS: Record<string, "check" | "calendar" | "ban" | "logOut"> = {
  ACTIVE: "check",
  ON_LEAVE: "calendar",
  SUSPENDED: "ban",
  EXITED: "logOut",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  PERMANENT: "Permanent",
  FIXED_TERM: "Fixed term",
  TEMPORARY: "Temporary",
  CONTRACTOR: "Contractor",
  APPRENTICE: "Apprentice",
};

export default async function EmployeesPage() {
  const { employees, counts, expiring, canCreate } = await withSession(
    async (session) => ({
      canCreate: session.permissions.has("hr.employee.create"),
      employees: await hrService.listEmployees(),
      counts: await headcount(),
      expiring: await expiringCertifications(),
    }),
  );

  return (
    <>
      <PageHeader
        title="People"
        description="Who works here, what expires, and who is away"
        action={
          canCreate ? (
            <ButtonLink href="/hr/employees/new" variant="primary" icon="plus">
              Add employee
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon="users"
          label="Headcount"
          value={String(counts.active)}
          hint={`${counts.withoutLogin} without a system login`}
        />
        <StatTile
          icon="folder"
          label="Permanent"
          value={String(counts.permanent)}
          hint={`${counts.nonPermanent} on other contracts`}
        />
        <StatTile
          icon="alert"
          label="Expired certifications"
          value={String(expiring.expired.length)}
          hint="Someone is on site without a valid ticket"
          tone={expiring.expired.length > 0 ? "danger" : "default"}
        />
        <StatTile
          icon="clock"
          label="Expiring in 90 days"
          value={String(expiring.soon.length)}
          hint="Book the renewals now"
          tone={expiring.soon.length > 0 ? "warning" : "default"}
        />
      </div>

      {expiring.expired.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            icon="alert"
            title="Expired certifications"
            description="Statutory tickets that have lapsed"
            action={
              <Badge tone="danger" icon="alert">
                {expiring.expired.length}
              </Badge>
            }
          />
          <ul className="divide-y divide-border">
            {expiring.expired.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-5 py-3 text-sm"
              >
                <Icon name="alert" className="text-danger" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.requirementName}</span>
                  <span className="block truncate text-xs text-faint">
                    {item.holderName}
                  </span>
                </span>
                <span className="tabular text-xs text-danger">
                  expired {formatDate(item.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          icon="users"
          title="Register"
          description="Everyone on the payroll, including people with no login"
        />
        {employees.length === 0 ? (
          <EmptyState
            icon="users"
            title="Nobody on the register yet"
            description="Add the first employee and their leave balances follow."
            action={
              canCreate ? (
                <ButtonLink href="/hr/employees/new">Add employee</ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium text-muted">
                  <th className="px-5 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Contract</th>
                  <th className="px-3 py-2.5">Started</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Login</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b border-border last:border-0 transition-colors hover:bg-surface-muted"
                  >
                    <td className="px-5 py-2">
                      <Link
                        href={`/hr/employees/${employee.id}`}
                        className="flex h-[52px] items-center gap-3"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-[10px] font-semibold text-muted">
                          {initials(`${employee.firstName} ${employee.lastName}`)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {employee.firstName} {employee.lastName}
                          </span>
                          <span className="tabular block truncate text-xs text-faint">
                            {employee.employeeNumber} · {employee.jobTitle ?? "—"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-sm text-muted">
                      {employee.department ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-muted">
                      {EMPLOYMENT_LABELS[employee.employmentType]}
                    </td>
                    <td className="tabular px-3 py-2 text-sm text-muted">
                      {formatDate(employee.startedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={STATUS_TONES[employee.status]}
                        icon={STATUS_ICONS[employee.status]}
                      >
                        {employee.status.replace("_", " ").toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-2 text-sm text-muted">
                      {employee.user ? (
                        <span className="truncate">{employee.user.email}</span>
                      ) : (
                        <span className="text-faint">No login</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
