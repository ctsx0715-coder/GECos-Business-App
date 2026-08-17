import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { formatCents, formatCentsExact, formatDate } from "@/lib/format";
import { procurementService } from "@/modules/procurement/procurement.service";
import { hrService } from "@/modules/hr/hr.service";
import { describeQuantity } from "@/lib/format";
import {
  billingTone,
  BILLING_LABELS,
  deliveryTone,
  DELIVERY_LABELS,
  EXPENSE_CATEGORY_LABELS,
  INVOICE_STATUS_LABELS,
  invoiceStatusTone,
  ORDER_STATUS_LABELS,
  orderStatusTone,
} from "@/modules/procurement/vocabulary";
import { NotFoundError } from "@/lib/errors";
import { Badge, Card, CardHeader, Field, PageHeader } from "@/components/ui";
import {
  CloseOrder,
  InvoiceDecision,
  OrderLifecycle,
  RecordInvoice,
  ReceiveDelivery,
} from "./manage";

/**
 * One order, with all three documents on the same page.
 *
 * The layout follows the argument rather than the schema: what was ordered,
 * what arrived against it, and what we have been billed — in that order, with
 * the discrepancies called out at the top. Somebody opens this page because a
 * supplier is on the phone, and the answer to "why have you not paid us" is
 * the difference between those three columns.
 */

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await withSession(async (session) => {
    if (!session.permissions.has("procurement.order.view")) return null;
    try {
      return {
        order: await procurementService.getOrder(id),
        // For naming whoever signs for a delivery. A storeman very often has
        // no login, so this is the employee register rather than the users.
        employees: session.permissions.has("hr.employee.view")
          ? await hrService.listEmployees()
          : [],
        mayReceive: session.permissions.has("procurement.receipt.record"),
        maySubmit: session.permissions.has("procurement.order.submit"),
        mayApprove: session.permissions.has("procurement.order.approve"),
        mayCancel: session.permissions.has("procurement.order.cancel"),
        mayRecordInvoice: session.permissions.has("procurement.invoice.record"),
        mayReleaseInvoice: session.permissions.has("procurement.invoice.approve"),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return "missing" as const;
      throw error;
    }
  });

  if (data === null) redirect("/dashboard");
  if (data === "missing") notFound();

  const { order } = data;
  const isLive = order.status === "APPROVED";

  return (
    <>
      <PageHeader
        title={order.reference}
        description={`${order.supplier.name}${order.project ? ` · ${order.project.name}` : " · no site"}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={orderStatusTone(order.status)}>
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
        {isLive && (
          <>
            <Badge tone={deliveryTone(order.match.delivery)}>
              {DELIVERY_LABELS[order.match.delivery]}
            </Badge>
            <Badge tone={billingTone(order.match.billing)}>
              {BILLING_LABELS[order.match.billing]}
            </Badge>
          </>
        )}
      </div>

      {isLive && order.concerns.length > 0 && (
        <Card className="border-warning-soft">
          <CardHeader
            title="These do not agree"
            description="The three documents are saying different things"
            icon="alert"
          />
          <ul className="space-y-1.5 px-5 py-4 text-sm">
            {order.concerns.map((note) => (
              <li key={note} className="text-warning">
                {note}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Ordered"
              description="What was asked for, and how much of it has arrived"
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-faint">
                    <th className="px-5 py-2.5 font-medium">#</th>
                    <th className="px-2 py-2.5 font-medium">Description</th>
                    <th className="px-2 py-2.5 text-right font-medium">Ordered</th>
                    <th className="px-2 py-2.5 text-right font-medium">Received</th>
                    <th className="px-2 py-2.5 font-medium">State</th>
                    <th className="px-5 py-2.5 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.match.lines.map((row, index) => (
                    <tr key={row.line.id}>
                      <td className="px-5 py-3 tabular-nums text-faint">
                        {order.lines[index]?.lineNumber ?? index + 1}
                      </td>
                      <td className="px-2 py-3">
                        <div>{row.line.description}</div>
                        <div className="text-xs text-faint">
                          {EXPENSE_CATEGORY_LABELS[
                            order.lines[index]?.category ?? "OTHER"
                          ] ?? "Other"}{" "}
                          · {formatCentsExact(row.line.unitPriceCents)} per{" "}
                          {row.line.unit}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {describeQuantity(row.line.quantity, row.line.unit)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {describeQuantity(row.receivedQuantity, row.line.unit)}
                        {row.rejectedQuantity > 0 && (
                          <div className="text-xs text-danger">
                            {describeQuantity(row.rejectedQuantity, row.line.unit)}{" "}
                            sent back
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <Badge tone={deliveryTone(row.delivery)}>
                          {DELIVERY_LABELS[row.delivery]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formatCentsExact(row.orderedCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td colSpan={5} className="px-5 py-3">
                      Ordered
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formatCentsExact(order.match.orderedCents)}
                    </td>
                  </tr>
                  <tr className="text-muted">
                    <td colSpan={5} className="px-5 pb-1">
                      Delivered
                    </td>
                    <td className="px-5 pb-1 text-right tabular-nums">
                      {formatCentsExact(order.match.receivedCents)}
                    </td>
                  </tr>
                  <tr
                    className={
                      order.match.billing === "OVER"
                        ? "font-medium text-danger"
                        : "text-muted"
                    }
                  >
                    <td colSpan={5} className="px-5 pb-3">
                      Invoiced
                    </td>
                    <td className="px-5 pb-3 text-right tabular-nums">
                      {formatCentsExact(order.match.invoicedCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Deliveries"
              description="Every load, with the note the driver handed over"
              action={
                data.mayReceive &&
                isLive && (
                  <ReceiveDelivery
                    orderId={order.id}
                    lines={order.match.lines.map((row, index) => ({
                      id: row.line.id,
                      lineNumber: order.lines[index]?.lineNumber ?? index + 1,
                      description: row.line.description,
                      unit: row.line.unit,
                      outstanding: row.outstandingQuantity,
                    }))}
                    employees={data.employees.map((employee) => ({
                      value: employee.id,
                      label: `${employee.firstName} ${employee.lastName}`,
                    }))}
                  />
                )
              }
            />
            {order.receipts.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">
                Nothing has arrived yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {order.receipts.map((receipt) => (
                  <li key={receipt.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{receipt.reference}</span>
                      <span className="text-sm text-muted">
                        {formatDate(receipt.receivedAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {receipt.deliveryNoteNumber &&
                        `Delivery note ${receipt.deliveryNoteNumber}`}
                      {receipt.receivedByEmployee &&
                        `${receipt.deliveryNoteNumber ? " · " : ""}signed by ${receipt.receivedByEmployee.firstName} ${receipt.receivedByEmployee.lastName}`}
                    </p>
                    <ul className="mt-1.5 space-y-0.5 text-xs">
                      {receipt.lines.map((line) => {
                        const against = order.match.lines.find(
                          (row) => row.line.id === line.purchaseOrderLineId,
                        );
                        return (
                          <li key={line.id} className="text-muted">
                            {describeQuantity(
                              Number(line.quantity.toString()),
                              against?.line.unit ?? "",
                            )}{" "}
                            {against?.line.description}
                            {Number(line.rejectedQuantity.toString()) > 0 && (
                              <span className="text-danger">
                                {" "}
                                — {describeQuantity(
                                  Number(line.rejectedQuantity.toString()),
                                  against?.line.unit ?? "",
                                )}{" "}
                                sent back: {line.rejectedReason}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {receipt.note && (
                      <p className="mt-1 text-xs text-faint">{receipt.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Invoices"
              description="Compared against what arrived, never against what was ordered"
              action={
                data.mayRecordInvoice &&
                order.status !== "DRAFT" &&
                order.status !== "SUBMITTED" && (
                  <RecordInvoice orderId={order.id} />
                )
              }
            />
            {order.invoices.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">
                Nothing has been invoiced yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {order.invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{invoice.invoiceNumber}</span>
                        <Badge tone={invoiceStatusTone(invoice.status)}>
                          {INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDate(invoice.invoicedAt)}
                        {invoice.dueAt && ` · due ${formatDate(invoice.dueAt)}`}
                      </p>
                      {invoice.disputedReason && (
                        <p className="mt-0.5 text-xs text-warning">
                          {invoice.disputedReason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {formatCentsExact(Number(invoice.netAmountCents))}
                      </span>
                      {data.mayReleaseInvoice && invoice.status !== "PAID" && (
                        <InvoiceDecision
                          id={invoice.id}
                          status={invoice.status}
                          overBilled={order.match.billing === "OVER"}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="The order" />
            <dl className="grid grid-cols-2 gap-4 px-5 py-4">
              <Field label="Supplier">{order.supplier.name}</Field>
              <Field label="Site">
                {order.project ? (
                  <Link
                    href={`/projects/${order.project.id}`}
                    className="text-accent hover:underline"
                  >
                    {order.project.name}
                  </Link>
                ) : (
                  "Yard or office"
                )}
              </Field>
              <Field label="Needed by">{formatDate(order.requiredBy)}</Field>
              <Field label="Value">{formatCents(order.match.orderedCents)}</Field>
              <Field label="Raised by">
                {order.submittedBy
                  ? `${order.submittedBy.firstName} ${order.submittedBy.lastName}`
                  : "—"}
              </Field>
              <Field label="Approved by">
                {order.approvedBy
                  ? `${order.approvedBy.firstName} ${order.approvedBy.lastName}`
                  : "—"}
              </Field>
              {order.deliverTo && (
                <div className="col-span-2">
                  <Field label="Deliver to">{order.deliverTo}</Field>
                </div>
              )}
              {order.notes && (
                <div className="col-span-2">
                  <Field label="Notes">
                    <span className="whitespace-pre-line">{order.notes}</span>
                  </Field>
                </div>
              )}
              {order.rejectedReason && (
                <div className="col-span-2">
                  <Field label="Reason">{order.rejectedReason}</Field>
                </div>
              )}
            </dl>
          </Card>

          <OrderLifecycle
            orderId={order.id}
            status={order.status}
            lineCount={order.lines.length}
            settled={order.match.settled}
            pendingApprovalId={order.pendingApproval?.id ?? null}
            maySubmit={data.maySubmit}
            mayApprove={data.mayApprove}
            mayCancel={data.mayCancel}
          />

          {isLive && data.mayApprove && (
            <CloseOrder orderId={order.id} settled={order.match.settled} />
          )}

          {order.approvalTrail && (
            <Card>
              <CardHeader
                title="Approval"
                description="Every rung, so the requester can see where it is sitting"
              />
              <ol className="divide-y divide-border">
                {order.approvalTrail.approvals.map((rung) => (
                  <li key={rung.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{rung.step.name}</span>
                      <Badge
                        tone={
                          rung.status === "APPROVED"
                            ? "success"
                            : rung.status === "REJECTED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {rung.status === "PENDING" ? "Waiting" : rung.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {rung.decidedBy
                        ? `${rung.decidedBy.firstName} ${rung.decidedBy.lastName}`
                        : rung.assignedToUser
                          ? `${rung.assignedToUser.firstName} ${rung.assignedToUser.lastName}`
                          : (rung.assignedToRole?.name ?? "Anyone who may approve")}
                    </p>
                    {rung.comment && (
                      <p className="mt-0.5 text-xs text-muted">{rung.comment}</p>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
