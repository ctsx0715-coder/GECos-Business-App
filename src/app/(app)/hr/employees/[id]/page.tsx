import Link from "next/link";
import { notFound } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { NotFoundError } from "@/lib/errors";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  PageHeader,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  AddCertificationInline,
  AdjustBalanceInline,
  EndEmployment,
  RemoveCertification,
} from "./manage";

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

/**
 * Where a certification sits against its expiry date.
 *
 * A qualification with no expiry is not overdue, it is permanent — treating a
 * null date as "expired in 1970" is how a trade test ends up on a chase list
 * forever. The same 90-day warning window as the compliance screen, because it
 * is the same expiry engine underneath (ADR-004).
 */
function expiryState(expiresAt: Date | null): {
  expired: boolean;
  soon: boolean;
} {
  if (!expiresAt) return { expired: false, soon: false };
  const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  return { expired: days < 0, soon: days >= 0 && days <= 90 };
}

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await withSession(async (session) => {
    try {
      return {
        employee: await hrService.getEmployee(id),
        balances: await hrService.balancesFor(id),
        certifications: await hrService.certificationsFor(id),
        /** Capped types only: an uncapped one has no balance to adjust. */
        leaveTypes: (await hrService.listLeaveTypes())
          .filter((type) => type.daysPerCycle !== null)
          .map((type) => ({ value: type.id, label: type.name })),
        mayEdit: session.permissions.has("hr.employee.edit"),
        mayExit: session.permissions.has("hr.employee.exit"),
        mayManageCertifications: session.permissions.has(
          "hr.certification.manage",
        ),
        mayConfigureLeave: session.permissions.has("hr.leave.configure"),
        /*
         * Their own record, reached through "My record". The buttons an
         * employee needs here are not the ones HR needs: booking their own
         * leave, and nothing else.
         */
        isMine: (await hrService.myEmployeeId()) === id,
        mayRequestLeave: session.permissions.has("hr.leave.request"),
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
          <span className="flex items-center gap-2">
            <Badge
              tone={employee.status === "EXITED" ? "neutral" : "accent"}
              icon={employee.status === "EXITED" ? "logOut" : "check"}
            >
              {employee.status.replace("_", " ").toLowerCase()}
            </Badge>
            {data.isMine && data.mayRequestLeave && employee.status !== "EXITED" && (
              <ButtonLink href="/hr/leave/new" icon="calendar">
                Request leave
              </ButtonLink>
            )}
            {data.mayEdit && (
              <ButtonLink href={`/hr/employees/${employee.id}/edit`} icon="pencil">
                Edit
              </ButtonLink>
            )}
          </span>
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
          {data.mayExit && employee.status !== "EXITED" && (
            <EndEmployment
              employeeId={employee.id}
              name={employee.firstName}
            />
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
          {data.mayConfigureLeave && employee.status !== "EXITED" && (
            <AdjustBalanceInline
              employeeId={employee.id}
              leaveTypes={data.leaveTypes}
            />
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
              const { expired, soon } = expiryState(cert.expiresAt);
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
                      {cert.certificateNumber && ` · ${cert.certificateNumber}`}
                      {cert.providerName && ` · ${cert.providerName}`}
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
                    {cert.expiresAt
                      ? `${expired ? "expired" : "expires"} ${formatDate(cert.expiresAt)}`
                      : "does not expire"}
                  </span>
                  {data.mayManageCertifications && (
                    <RemoveCertification
                      certificationId={cert.id}
                      employeeId={employee.id}
                      name={cert.requirementName}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {data.mayManageCertifications && (
          <AddCertificationInline employeeId={employee.id} />
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
