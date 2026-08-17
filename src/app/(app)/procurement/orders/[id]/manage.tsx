"use client";

import { useState } from "react";
import { describeQuantity } from "@/modules/procurement/matching";
import { Card, CardHeader, Icon } from "@/components/ui";
import { useFormAction } from "@/components/forms";
import {
  cancelOrderAction,
  closeOrderAction,
  decideInvoiceAction,
  decideOrderAction,
  recordInvoiceAction,
  recordReceiptAction,
  submitOrderAction,
} from "../../actions";

/**
 * The things somebody does to an order.
 *
 * Each of these is a small form that appears where the decision is made rather
 * than on a page of its own, because every one of them is done with a piece of
 * paper in the other hand — a delivery note, an invoice — and a round trip to
 * a separate screen is a round trip away from the paper.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

const linkClass = "text-xs font-medium text-accent hover:underline disabled:opacity-50";

/** Today in the browser's own clock, for a `date` input. */
function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

// ---------------------------------------------------------------------------

interface ReceivableLine {
  id: string;
  lineNumber: number;
  description: string;
  unit: string;
  outstanding: number;
}

/**
 * Signing for a delivery.
 *
 * Pre-filled with what is still outstanding on each line, because that is what
 * a full delivery looks like and typing it again is how a digit gets dropped.
 * Every figure stays editable — the whole point of receiving is that what
 * arrived is often not what was ordered.
 */
export function ReceiveDelivery({
  orderId,
  lines,
  employees,
}: {
  orderId: string;
  lines: ReceivableLine[];
  employees: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [receivedAt, setReceivedAt] = useState(today());
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState("");
  const [receivedByEmployeeId, setReceivedByEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((line) => [line.id, line.outstanding > 0 ? String(line.outstanding) : ""]),
    ),
  );
  const [rejected, setRejected] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const { pending, message, submit } = useFormAction(() => setOpen(false));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        Record a delivery
      </button>
    );
  }

  const payload = lines
    .map((line) => ({
      purchaseOrderLineId: line.id,
      quantity: Number(quantities[line.id]) || 0,
      rejectedQuantity: Number(rejected[line.id]) || 0,
      rejectedReason: reasons[line.id] || undefined,
    }))
    .filter((line) => line.quantity > 0 || line.rejectedQuantity > 0);

  return (
    <div className="w-full space-y-3 pt-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Arrived on
          </span>
          <input
            type="date"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Delivery note
          </span>
          <input
            value={deliveryNoteNumber}
            onChange={(event) => setDeliveryNoteNumber(event.target.value)}
            placeholder="Off the driver's paper"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Signed for by
          </span>
          <select
            value={receivedByEmployeeId}
            onChange={(event) => setReceivedByEmployeeId(event.target.value)}
            className={inputClass}
          >
            <option value="">Not recorded</option>
            {employees.map((employee) => (
              <option key={employee.value} value={employee.value}>
                {employee.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        {lines.map((line) => (
          <div
            key={line.id}
            className="grid gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[1fr_100px_100px]"
          >
            <div className="text-sm">
              <span className="text-faint">{line.lineNumber}.</span>{" "}
              {line.description}
              <div className="text-xs text-muted">
                {line.outstanding > 0
                  ? `${describeQuantity(line.outstanding, line.unit)} still to come`
                  : "Nothing outstanding"}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
                Accepted
              </span>
              <input
                inputMode="decimal"
                value={quantities[line.id] ?? ""}
                onChange={(event) =>
                  setQuantities((current) => ({
                    ...current,
                    [line.id]: event.target.value.replace(/[^\d.]/g, ""),
                  }))
                }
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
                Sent back
              </span>
              <input
                inputMode="decimal"
                value={rejected[line.id] ?? ""}
                onChange={(event) =>
                  setRejected((current) => ({
                    ...current,
                    [line.id]: event.target.value.replace(/[^\d.]/g, ""),
                  }))
                }
                className={inputClass}
              />
            </label>
            {Number(rejected[line.id]) > 0 && (
              <div className="sm:col-span-3">
                <input
                  value={reasons[line.id] ?? ""}
                  onChange={(event) =>
                    setReasons((current) => ({
                      ...current,
                      [line.id]: event.target.value,
                    }))
                  }
                  placeholder="Why was it sent back? The supplier will ask"
                  className={inputClass}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
          Note
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={inputClass}
        />
      </label>

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || payload.length === 0}
          onClick={() =>
            submit(() =>
              recordReceiptAction({
                purchaseOrderId: orderId,
                receivedAt,
                deliveryNoteNumber: deliveryNoteNumber || undefined,
                receivedByEmployeeId: receivedByEmployeeId || undefined,
                note: note || undefined,
                lines: payload,
              }),
            )
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Record it"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Capturing what the supplier says we owe. */
export function RecordInvoice({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoicedAt, setInvoicedAt] = useState(today());
  const [dueAt, setDueAt] = useState("");
  const [netAmountRands, setNetAmountRands] = useState("");
  const [vatRands, setVatRands] = useState("");

  const { pending, message, submit } = useFormAction(() => setOpen(false));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkClass}>
        Record an invoice
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 pt-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Their invoice number
          </span>
          <input
            autoFocus
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Invoiced on
          </span>
          <input
            type="date"
            value={invoicedAt}
            onChange={(event) => setInvoicedAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Due
          </span>
          <input
            type="date"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            Amount excluding VAT
          </span>
          <input
            inputMode="decimal"
            value={netAmountRands}
            onChange={(event) =>
              setNetAmountRands(event.target.value.replace(/[^\d.]/g, ""))
            }
            className={inputClass}
          />
          <span className="mt-1 block text-[11px] text-faint">
            Excluding, so it compares with the order
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
            VAT
          </span>
          <input
            inputMode="decimal"
            value={vatRands}
            onChange={(event) => setVatRands(event.target.value.replace(/[^\d.]/g, ""))}
            className={inputClass}
          />
        </label>
      </div>

      {message && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !invoiceNumber.trim() || !netAmountRands}
          onClick={() =>
            submit(() =>
              recordInvoiceAction({
                purchaseOrderId: orderId,
                invoiceNumber,
                invoicedAt,
                dueAt: dueAt || undefined,
                netAmountRands: Number(netAmountRands) || 0,
                vatRands: Number(vatRands) || 0,
              }),
            )
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Record it"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Releasing an invoice, or arguing with it.
 *
 * When the order is over-billed the release asks for a reason first. It is not
 * a veto — a supplier may legitimately invoice ahead on a long lead item — but
 * it must not be possible to do it without anybody noticing.
 */
export function InvoiceDecision({
  id,
  status,
  overBilled,
}: {
  id: string;
  status: string;
  overBilled: boolean;
}) {
  const [asking, setAsking] = useState<null | "APPROVED" | "DISPUTED">(null);
  const [reason, setReason] = useState("");
  const { pending, message, submit } = useFormAction(() => {
    setAsking(null);
    setReason("");
  });

  if (asking) {
    return (
      <div className="flex flex-col gap-1.5">
        <input
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            asking === "DISPUTED"
              ? "What is wrong with it?"
              : "Why release it over the goods?"
          }
          className="w-64 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || reason.trim().length === 0}
            onClick={() =>
              submit(() => decideInvoiceAction({ id, decision: asking, reason }))
            }
            className={linkClass}
          >
            {pending ? "Saving…" : asking === "DISPUTED" ? "Dispute" : "Release"}
          </button>
          <button
            type="button"
            onClick={() => setAsking(null)}
            className="text-xs text-muted hover:underline"
          >
            Cancel
          </button>
        </div>
        {message && <p className="text-xs text-danger">{message}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {status === "RECEIVED" && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              overBilled
                ? setAsking("APPROVED")
                : submit(() => decideInvoiceAction({ id, decision: "APPROVED" }))
            }
            className={linkClass}
          >
            Release
          </button>
          <button
            type="button"
            onClick={() => setAsking("DISPUTED")}
            className="text-xs text-muted hover:underline"
          >
            Dispute
          </button>
        </>
      )}
      {status === "APPROVED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(() => decideInvoiceAction({ id, decision: "PAID" }))}
          className={linkClass}
        >
          Mark paid
        </button>
      )}
      {message && <span className="text-xs text-danger">{message}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Submit, approve, reject, cancel — whichever the order's state allows. */
export function OrderLifecycle({
  orderId,
  status,
  lineCount,
  pendingApprovalId,
  maySubmit,
  mayApprove,
  mayCancel,
}: {
  orderId: string;
  status: string;
  lineCount: number;
  settled: boolean;
  pendingApprovalId: string | null;
  maySubmit: boolean;
  mayApprove: boolean;
  mayCancel: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, message, submit } = useFormAction(() => {
    setCancelling(false);
    setRejecting(false);
    setReason("");
  });

  // Whether this card has anything in it at all.
  //
  // An approved order offers nothing here — receiving and invoicing happen in
  // their own cards, and closing has one of its own — so the card would render
  // as a heading over empty space. So would a submitted order in front of
  // somebody who cannot approve or cancel it. An empty panel reads as a
  // failure to load rather than as "nothing for you to do".
  const canSubmit = status === "DRAFT" && maySubmit;
  const canDecide = status === "SUBMITTED" && Boolean(pendingApprovalId) && mayApprove;
  const canAbandon = (status === "DRAFT" || status === "SUBMITTED") && mayCancel;
  const isWaiting = status === "SUBMITTED" && !mayApprove;
  const isEmptyDraft = status === "DRAFT" && lineCount === 0;

  if (!canSubmit && !canDecide && !canAbandon && !isWaiting && !isEmptyDraft) {
    return null;
  }

  return (
    <Card>
      <CardHeader title="What happens next" />
      <div className="space-y-2 px-5 py-4">
        {canSubmit && (
          <button
            type="button"
            disabled={pending || lineCount === 0}
            onClick={() => submit(() => submitOrderAction({ id: orderId }))}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send for approval"}
          </button>
        )}

        {isEmptyDraft && (
          <p className="text-xs text-muted">
            There is nothing on this order yet.
          </p>
        )}

        {canDecide && !rejecting && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                submit(() =>
                  decideOrderAction({
                    approvalId: pendingApprovalId,
                    decision: "APPROVED",
                  }),
                )
              }
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-surface-muted"
            >
              Reject
            </button>
          </div>
        )}

        {rejecting && pendingApprovalId && (
          <div className="space-y-2">
            <input
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is it being rejected?"
              className={inputClass}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || reason.trim().length === 0}
                onClick={() =>
                  submit(() =>
                    decideOrderAction({
                      approvalId: pendingApprovalId,
                      decision: "REJECTED",
                      comment: reason,
                    }),
                  )
                }
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Reject it
              </button>
              <button
                type="button"
                onClick={() => setRejecting(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isWaiting && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Icon name="clock" size={14} />
            With an approver. Nothing is committed until they sign.
          </p>
        )}

        {canAbandon && !cancelling && (
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="text-xs text-muted hover:underline"
          >
            Cancel this order
          </button>
        )}

        {cancelling && (
          <div className="space-y-2">
            <input
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is it being cancelled?"
              className={inputClass}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || reason.trim().length < 3}
                onClick={() =>
                  submit(() => cancelOrderAction({ id: orderId, reason }))
                }
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Cancel it
              </button>
              <button
                type="button"
                onClick={() => setCancelling(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-muted"
              >
                Keep it
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {message}
          </p>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * Finishing with an order.
 *
 * An order that does not balance can still be closed — the supplier has
 * written the balance off, or nobody is going to chase forty rand — but it
 * cannot be closed silently.
 */
export function CloseOrder({
  orderId,
  settled,
}: {
  orderId: string;
  settled: boolean;
}) {
  const [reason, setReason] = useState("");
  const { pending, message, submit } = useFormAction();

  return (
    <Card>
      <CardHeader
        title="Close it"
        description={
          settled
            ? "Everything arrived and the invoice matches"
            : "It does not balance, so say why it is being closed anyway"
        }
      />
      <div className="space-y-2 px-5 py-4">
        {!settled && (
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Balance written off, agreed with the supplier"
            className={inputClass}
          />
        )}
        <button
          type="button"
          disabled={pending || (!settled && reason.trim().length === 0)}
          onClick={() =>
            submit(() =>
              closeOrderAction({ id: orderId, reason: reason || undefined }),
            )
          }
          className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-50"
        >
          {pending ? "Closing…" : "Close the order"}
        </button>
        {message && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            {message}
          </p>
        )}
      </div>
    </Card>
  );
}
