import Link from "next/link";
import { notFound } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { certificationsFor } from "@/lib/analytics/hr-metrics";
import { NotFoundError } from "@/lib/errors";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  PageHeader,
} from "@/components/ui";
import { formatDate, formatRelativeDays } from "@/lib/format";

/** One person: their record, their tickets, their leave. */

const EMPLOYMENT_LABELS: Record<string, string> = {
  PERMANENT: "Permanent",
  FIXED_TERM: "Fixed term",
  TEMPORARY: "Temporary",
  CONTRACTOR: "Contractor",
  APPRENTICE: "Apprentice",
};

const LEAVE_TONES: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const LEAVE_ICONS: Record<string, "clock" | "check" | "ban"> = {
  SUBMITTED: "clock",
  APPROVED: "check",
  REJECTED: "ban",
  CANCELLED: "ban",
};

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await withSession(async () => {
    try {
      return {
        employee: await hrService.getEmployee(id),
        balances: await hrService.balancesFor(id),
        certifications: await certificationsFor(id),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

  if (!data) notFound();
  const { employee, balances, certifications } = data;

  return (
    <>
      <PageHeader
        title={`${employee.firstName} ${employee.lastName}`}
        description={[employee.jobTitle, employee.department]
          .filter(Boolean)
          .join(" · ")}
        action={
          <Badge
            tone={employee.status === "EXITED" ? "neutral" : "accent"}
            icon={employee.status === "EXITED" ? "logOut" : "check"}
          >
            {employee.status.replace("_", " ").toLowerCase()}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader icon="users" title="Record" />
          <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Field label="Employee number">
              <span className="tabular">{employee.employeeNumber}</span>
            </Field>
            <Field label="Contract">
              {EMPLOYMENT_LABELS[employee.employmentType]}
            </Field>
            <Field label="Started">
              <span className="tabular">{formatDate(employee.startedAt)}</span>
            </Field>
            <Field label="Reports to">
              {employee.manager ? (
                <Link
                  href={`/hr/employees/${employee.manager.id}`}
                  className="underline decoration-border underline-offset-4"
                >
                  {employee.manager.firstName} {employee.manager.lastName}
                </Link>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Email">{employee.email ?? "—"}</Field>
            <Field label="Phone">{employee.phone ?? "—"}</Field>
            <Field label="System login">
              {employee.user ? employee.user.email : "None"}
            </Field>
            {employee.endedAt && (
              <Field label="Last day">
                <span className="tabular">{formatDate(employee.endedAt)}</span>
              </Field>
            )}
          </dl>
          {employee.exitReason && (
            <p className="border-t border-border px-5 py-3 text-xs text-muted">
              {employee.exitReason}
            </p>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            icon="calendar"
            title="Leave balances"
            description="Days remaining in the current cycle"
          />
          {balances.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No balances set"
              description="An administrator sets the entitlement for each cycle before leave can be booked."
            />
          ) : (
            <ul className="divide-y divide-border">
              {balances.map((balance) => (
                <li
                  key={balance.leaveTypeId}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {balance.leaveTypeName}
                    </span>
                    <span className="tabular block text-xs text-faint">
                      {balance.takenDays} taken of{" "}
                      {balance.entitledDays + balance.broughtForwardDays}
                    </span>
                  </span>
                  {balance.isUncapped ? (
                    <span className="text-xs text-muted">Uncapped</span>
                  ) : (
                    <span className="tabular text-lg font-semibold">
                      {balance.remainingDays}
                      <span className="ml-1 text-xs font-normal text-muted">
                        left
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          icon="shield"
          title="Certifications"
          description="Tickets and medicals, watched by the same expiry sweep as company compliance"
        />
        {certifications.length === 0 ? (
          <EmptyState
            icon="shield"
            title="No certifications recorded"
            description="Add the tickets this role needs so their expiry is tracked rather than remembered."
          />
        ) : (
          <ul className="divide-y divide-border">
            {certifications.map((cert) => {
              const relative = formatRelativeDays(cert.expiresAt);
              const expired = relative.days < 0;
              const soon = !expired && relative.days <= 90;
              return (
                <li key={cert.id} className="flex items-center gap-3 px-5 py-3">
                  <Icon
                    name={expired ? "alert" : soon ? "clock" : "checkCircle"}
                    className={
                      expired
                        ? "text-danger"
                        : soon
                          ? "text-warning"
                          : "text-success"
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {cert.requirementName}
                    </span>
                    <span className="block text-xs text-faint">
                      {cert.category.toLowerCase()}
                    </span>
                  </span>
                  <span
                    className={`tabular text-xs ${
                      expired
                        ? "text-danger"
                        : soon
                          ? "text-warning"
                          : "text-muted"
                    }`}
                  >
                    {expired ? "expired" : "expires"} {formatDate(cert.expiresAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader icon="calendar" title="Leave history" />
        {employee.leaveRequests.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No leave booked"
            description="Requests appear here once submitted, whoever books them."
          />
        ) : (
          <ul className="divide-y divide-border">
            {employee.leaveRequests.map((request) => (
              <li key={request.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {request.leaveType.name}
                  </span>
                  <span className="tabular block text-xs text-faint">
                    {formatDate(request.startsAt)} – {formatDate(request.endsAt)}
                    {" · "}
                    {String(request.days)} days
                  </span>
                </span>
                <Badge
                  tone={LEAVE_TONES[request.status]}
                  icon={LEAVE_ICONS[request.status]}
                >
                  {request.status.toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
