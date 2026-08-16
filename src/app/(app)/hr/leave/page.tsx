import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import { leaveSummary } from "@/lib/analytics/hr-metrics";
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
import { formatDate } from "@/lib/format";
import { LeaveDecision } from "./decision";

/**
 * The leave register.
 *
 * Pending requests sit at the top because they are the only rows anyone has to
 * act on. The approve and reject buttons are offered to everyone holding the
 * permission, including on your own request — the service refuses that, and a
 * visible refusal teaches the rule where a hidden button would not.
 */

const STATUS_TONES: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const STATUS_ICONS: Record<string, "clock" | "check" | "ban"> = {
  SUBMITTED: "clock",
  APPROVED: "check",
  REJECTED: "ban",
  CANCELLED: "ban",
};

/**
 * The rungs one request still has to climb.
 *
 * Shown only when a chain is configured. Without one, leave is decided by
 * whoever holds the permission and there is no ladder to draw — which is how
 * the feature stays optional rather than becoming ceremony for a company of
 * fifteen people.
 */
function ApprovalLadder({
  steps,
}: {
  steps: Array<{
    id: string;
    name: string;
    status: string;
    approver: string;
    decidedBy: string | null;
    isMine: boolean;
  }>;
}) {
  // The rung the request is actually sitting on. Everything before it has
  // been decided; everything after it is waiting its turn.
  const current = steps.findIndex((step) => step.status === "PENDING");

  return (
    <ol className="mt-2 space-y-1 border-l border-border pl-3">
      {steps.map((step, index) => (
        <li key={step.id} className="text-xs">
          <span className={index === current ? "" : "text-faint"}>
            <span className="tabular">{index + 1}.</span> {step.name} —{" "}
            {step.decidedBy ?? step.approver}
          </span>
          {step.status !== "PENDING" ? (
            <span className="ml-1.5 text-faint">· {step.status.toLowerCase()}</span>
          ) : index === current ? (
            <span className="ml-1.5 text-warning">
              {step.isMine ? "· yours to decide" : "· waiting"}
            </span>
          ) : (
            <span className="ml-1.5 text-faint">· then</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export default async function LeavePage() {
  const { requests, summary, canApprove, canRequest, ladders } = await withSession(
    async (session) => {
      const requests = await hrService.listLeaveRequests();
      const waiting = requests.filter((request) => request.status === "SUBMITTED");

      /*
       * One query set per pending request. The list is short by construction —
       * these are the rows somebody has to act on today — and the alternative
       * is a join that would make every other leave screen carry approval
       * plumbing it does not use.
       */
      const trails = await Promise.all(
        waiting.map(async (request) => [
          request.id,
          await hrService.approvalTrail(request.id),
        ] as const),
      );

      return {
        canApprove: session.permissions.has("hr.leave.approve"),
        canRequest: session.permissions.has("hr.leave.request"),
        summary: await leaveSummary(),
        requests,
        ladders: new Map(trails),
      };
    },
  );

  const pending = requests.filter((r) => r.status === "SUBMITTED");
  const decided = requests.filter((r) => r.status !== "SUBMITTED");

  return (
    <>
      <PageHeader
        title="Leave"
        description="Who is away, who is asking, and what is left"
        action={
          canRequest ? (
            <ButtonLink href="/hr/leave/new" variant="primary" icon="plus">
              Request leave
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          icon="inbox"
          label="Awaiting a decision"
          value={String(summary.pendingRequests)}
          hint="Requests nobody has answered"
          tone={summary.pendingRequests > 0 ? "warning" : "default"}
        />
        <StatTile
          icon="calendar"
          label="Away today"
          value={String(summary.awayToday)}
          hint="Approved and currently on leave"
        />
        <StatTile
          icon="users"
          label="Away in 14 days"
          value={String(summary.awayNext14Days)}
          hint="Plan the site around it"
        />
      </div>

      <Card>
        <CardHeader
          icon="inbox"
          title="Awaiting a decision"
          description="Days are already committed against the balance"
          action={
            <Badge
              tone={pending.length > 0 ? "warning" : "success"}
              icon={pending.length > 0 ? "clock" : "check"}
            >
              {pending.length}
            </Badge>
          }
        />
        {pending.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Nothing waiting"
            description="Every request has been answered."
            action={
              canRequest ? (
                <ButtonLink href="/hr/leave/new">Request leave</ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((request) => (
              <li key={request.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/hr/employees/${request.employee.id}`}
                      className="block text-sm font-medium"
                    >
                      {request.employee.firstName} {request.employee.lastName}
                    </Link>
                    <span className="tabular block text-xs text-faint">
                      {request.reference} · {request.leaveType.name} ·{" "}
                      {formatDate(request.startsAt)} –{" "}
                      {formatDate(request.endsAt)} · {String(request.days)} days
                    </span>
                    {request.reason && (
                      <span className="mt-1 block text-xs text-muted">
                        {request.reason}
                      </span>
                    )}
                    {!request.leaveType.isPaid && (
                      <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                        <Icon name="alert" size={12} className="text-warning" />
                        Unpaid
                      </span>
                    )}
                  </span>
                  {canApprove && <LeaveDecision requestId={request.id} />}
                </div>
                {(ladders.get(request.id)?.steps.length ?? 0) > 0 && (
                  <ApprovalLadder steps={ladders.get(request.id)!.steps} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader icon="history" title="Decided" />
        {decided.length === 0 ? (
          <EmptyState
            icon="history"
            title="No history yet"
            description="Approved, rejected and cancelled requests collect here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {decided.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {request.employee.firstName} {request.employee.lastName}
                  </span>
                  <span className="tabular block text-xs text-faint">
                    {request.leaveType.name} · {formatDate(request.startsAt)} –{" "}
                    {formatDate(request.endsAt)} · {String(request.days)} days
                  </span>
                </span>
                {request.decidedBy && (
                  <span className="text-xs text-muted">
                    by {request.decidedBy.firstName} {request.decidedBy.lastName}
                  </span>
                )}
                <Badge
                  tone={STATUS_TONES[request.status]}
                  icon={STATUS_ICONS[request.status]}
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
