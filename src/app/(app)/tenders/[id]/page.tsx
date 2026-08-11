import Link from "next/link";
import { notFound } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { db } from "@/lib/database/client";
import { NotFoundError } from "@/lib/errors";
import { tenderService } from "@/modules/tenders/tender.service";
import {
  Badge,
  Card,
  CardHeader,
  Field,
  PageHeader,
  statusTone,
} from "@/components/ui";
import {
  formatCents,
  formatDate,
  formatRelativeDays,
  tenderStatusLabel,
} from "@/lib/format";
import { Checklist } from "./checklist";

export default async function TenderDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const data = await withSession(async (session) => {
    try {
      const tender = await tenderService.getById(id);
      const approvals = await db.workflowApproval.findMany({
        where: { instance: { entityType: "TENDER", entityId: id } },
        orderBy: { sortOrder: "asc" },
        include: {
          step: { select: { name: true } },
          assignedToUser: { select: { firstName: true, lastName: true } },
          assignedToRole: { select: { name: true } },
          decidedBy: { select: { firstName: true, lastName: true } },
        },
      });
      const audit = await db.auditLog.findMany({
        where: { entityType: "Tender", entityId: id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { actor: { select: { firstName: true, lastName: true } } },
      });
      return { tender, approvals, audit, session };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

  if (!data) notFound();
  const { tender, approvals, audit, session } = data;

  const closing = formatRelativeDays(tender.closingAt);
  const canEdit =
    session.permissions.has("tenders.tender.edit") &&
    tender.status !== "SUBMITTED";
  const canSubmit = session.permissions.has(
    "tenders.tender.submit_for_approval",
  );
  const inApproval = tender.status === "PENDING_APPROVAL";

  return (
    <>
      <div className="mb-4">
        <Link href="/tenders" className="text-xs text-muted hover:underline">
          ← Tender register
        </Link>
      </div>

      <PageHeader
        title={tender.title}
        description={`${tender.reference}${tender.tenderNumber ? ` · client ref ${tender.tenderNumber}` : ""}`}
        action={
          <Badge tone={statusTone(tender.status)}>
            {tenderStatusLabel(tender.status)}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <Checklist
              tenderId={tender.id}
              requirements={tender.requirements}
              canEdit={canEdit}
              canSubmit={canSubmit}
              alreadySubmitted={
                inApproval ||
                tender.status === "SUBMITTED" ||
                tender.status === "APPROVED"
              }
            />
          </Card>

          {approvals.length > 0 && (
            <Card>
              <CardHeader
                title="Approval chain"
                description="Linear steps, decided in order"
              />
              <ol className="divide-y divide-border">
                {approvals.map((approval) => {
                  const assignee =
                    approval.assignedToUser
                      ? `${approval.assignedToUser.firstName} ${approval.assignedToUser.lastName}`
                      : (approval.assignedToRole?.name ?? "Unassigned");
                  const tone =
                    approval.status === "APPROVED"
                      ? "success"
                      : approval.status === "REJECTED"
                        ? "danger"
                        : "warning";
                  return (
                    <li
                      key={approval.id}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-muted">
                        {approval.sortOrder + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {approval.step.name}
                        </span>
                        <span className="block text-xs text-muted">
                          {assignee}
                          {approval.decidedBy &&
                            ` · decided by ${approval.decidedBy.firstName} ${approval.decidedBy.lastName}`}
                        </span>
                      </span>
                      <Badge tone={tone}>{approval.status.toLowerCase()}</Badge>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Activity"
              description="Written automatically by the audit extension"
            />
            {audit.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">
                No recorded activity.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {audit.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">
                        <span className="font-medium">
                          {entry.actor
                            ? `${entry.actor.firstName} ${entry.actor.lastName}`
                            : "System"}
                        </span>{" "}
                        <span className="text-muted">
                          {entry.action.toLowerCase()}d this tender
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="grid gap-4 px-5 py-4">
              <Field label="Client">{tender.customer?.name ?? "—"}</Field>
              <Field label="Estimated value">
                <span className="tabular">
                  {formatCents(tender.estimatedValueCents)}
                </span>
              </Field>
              <Field label="Closing">
                {formatDate(tender.closingAt)}
                <span
                  className={`ml-2 text-xs ${
                    closing.days >= 0 && closing.days <= 7
                      ? "font-medium text-danger"
                      : "text-muted"
                  }`}
                >
                  {closing.label}
                </span>
              </Field>
              <Field label="Industry">{tender.industry ?? "—"}</Field>
              <Field label="Owner">
                {tender.owner
                  ? `${tender.owner.firstName} ${tender.owner.lastName}`
                  : "Unassigned"}
              </Field>
              {tender.outcomeNotes && (
                <Field label="Outcome">{tender.outcomeNotes}</Field>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Documents" />
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-muted">
                Document upload is not wired in yet.
              </p>
              <p className="mt-1 text-xs text-muted">
                The schema and versioning are in place; presigned uploads need
                Vercel Blob credentials.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
