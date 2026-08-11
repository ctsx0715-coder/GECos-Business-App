import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import { db } from "@/lib/database/client";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { formatCents, formatDate, formatRelativeDays } from "@/lib/format";
import { DecisionButtons } from "./decision";

/**
 * The approvals queue.
 *
 * Shows only the step currently awaiting a decision on each chain — a later
 * step is not actionable and showing it as though it were would be misleading.
 */
export default async function ApprovalsPage() {
  const data = await withSession(async (session) => {
    const roleIds = (
      await db.userRole.findMany({
        where: { userId: session.userId },
        select: { roleId: true },
      })
    ).map((r) => r.roleId);

    const pending = await db.workflowApproval.findMany({
      where: {
        status: "PENDING",
        instance: { status: "PENDING" },
        OR: [
          { assignedToUserId: session.userId },
          { assignedToRoleId: { in: roleIds } },
        ],
      },
      orderBy: [{ dueAt: "asc" }],
      include: {
        step: { select: { name: true } },
        instance: {
          select: { id: true, entityId: true, startedById: true },
        },
      },
    });

    // Only the earliest outstanding step in each chain can actually be decided.
    const actionable = [];
    for (const approval of pending) {
      const earliest = await db.workflowApproval.findFirst({
        where: {
          workflowInstanceId: approval.workflowInstanceId,
          status: "PENDING",
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      });
      if (earliest?.id !== approval.id) continue;

      const tender = await db.tender.findUnique({
        where: { id: approval.instance.entityId },
        select: {
          id: true,
          reference: true,
          title: true,
          estimatedValueCents: true,
          closingAt: true,
          ownerId: true,
          customer: { select: { name: true } },
        },
      });
      if (tender) actionable.push({ approval, tender });
    }

    return { actionable, session };
  });

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Tender submissions awaiting your decision"
      />

      {data.actionable.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing awaiting your decision"
            description="Approvals assigned to you or to one of your roles appear here, in the order they are due."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {data.actionable.map(({ approval, tender }) => {
            const due = formatRelativeDays(approval.dueAt);
            const isOwner = tender.ownerId === data.session.userId;
            const isRequester =
              approval.instance.startedById === data.session.userId;

            return (
              <Card key={approval.id}>
                <CardHeader
                  title={approval.step.name}
                  description={`Due ${due.label} · ${formatDate(approval.dueAt)}`}
                  action={
                    <Badge tone={due.days <= 1 ? "danger" : "warning"}>
                      Pending
                    </Badge>
                  }
                />
                <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Link
                      href={`/tenders/${tender.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {tender.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      <span className="tabular">{tender.reference}</span> ·{" "}
                      {tender.customer?.name} · closes{" "}
                      {formatDate(tender.closingAt)}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs uppercase tracking-wide text-muted">
                      Value
                    </p>
                    <p className="tabular text-lg font-semibold">
                      {formatCents(tender.estimatedValueCents)}
                    </p>
                  </div>
                </div>

                <div className="border-t border-border px-5 py-4">
                  {(isOwner || isRequester) && (
                    <p className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                      You {isOwner ? "own" : "submitted"} this tender. The
                      server will refuse your decision — separation of duties
                      applies even though your role can approve.
                    </p>
                  )}
                  <DecisionButtons approvalId={approval.id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
