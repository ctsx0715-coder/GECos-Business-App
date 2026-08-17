import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { formatCentsExact, formatDate, formatRelativeDays } from "@/lib/format";
import { procurementService } from "@/modules/procurement/procurement.service";
import {
  INVOICE_STATUS_LABELS,
  invoiceStatusTone,
} from "@/modules/procurement/vocabulary";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

/**
 * Everything a supplier says we owe.
 *
 * Deliberately a flat list rather than a per-order view, because the person
 * who works through these works through a pile of paper rather than through
 * one order at a time. The decision belongs on the order page, where the three
 * documents can be compared — this list is how they get there.
 */

export const dynamic = "force-dynamic";

export default async function SupplierInvoicesPage() {
  const invoices = await withSession(async (session) => {
    if (!session.permissions.has("procurement.invoice.view")) return null;
    return procurementService.listInvoices();
  });

  if (!invoices) redirect("/dashboard");

  const outstanding = invoices.filter((invoice) => invoice.status !== "PAID");

  return (
    <>
      <PageHeader
        title="Supplier invoices"
        description="What we have been billed, and where each one has got to"
      />

      <Card>
        <CardHeader
          title={`${outstanding.length} not yet paid`}
          description="Open the order to compare an invoice against what actually arrived"
        />
        {invoices.length === 0 ? (
          <EmptyState
            title="Nothing invoiced"
            description="Supplier invoices are captured against the order they belong to."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-faint">
                  <th className="px-5 py-2.5 font-medium">Invoice</th>
                  <th className="px-5 py-2.5 font-medium">Supplier</th>
                  <th className="px-5 py-2.5 font-medium">Order</th>
                  <th className="px-5 py-2.5 font-medium">Due</th>
                  <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => {
                  const due = invoice.dueAt ? formatRelativeDays(invoice.dueAt) : null;
                  const overdue =
                    due !== null && due.days < 0 && invoice.status !== "PAID";
                  return (
                    <tr key={invoice.id}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{invoice.invoiceNumber}</div>
                        <div className="text-xs text-faint">
                          {formatDate(invoice.invoicedAt)}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {invoice.supplier.name}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/procurement/orders/${invoice.purchaseOrder.id}`}
                          className="text-accent hover:underline"
                        >
                          {invoice.purchaseOrder.reference}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        {due === null ? (
                          <span className="text-faint">—</span>
                        ) : overdue ? (
                          <Badge tone="danger" icon="alert">
                            {due.label}
                          </Badge>
                        ) : (
                          <span className="text-muted">{due.label}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formatCentsExact(Number(invoice.netAmountCents))}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={invoiceStatusTone(invoice.status)}>
                          {INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
