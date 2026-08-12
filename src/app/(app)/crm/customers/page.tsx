import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import { crmService } from "@/modules/crm/crm.service";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

/**
 * The customer list.
 *
 * The counts matter more than they look: one customer record carries its
 * contacts, its deals and its tenders, which is the "create it once, use it
 * everywhere" principle made visible.
 */
export default async function CustomersPage() {
  const customers = await withSession(() => crmService.listCustomers());

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${customers.length} on the books`}
      />

      <Card>
        {customers.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Convert a lead, and its customer record is created here automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 text-right font-medium">Contacts</th>
                  <th className="px-5 py-3 text-right font-medium">Deals</th>
                  <th className="px-5 py-3 text-right font-medium">Tenders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((customer) => (
                  <tr key={customer.id} className="transition hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link
                        href={`/crm/customers/${customer.id}`}
                        className="font-medium hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {customer.isPublicSector && (
                        <span className="ml-2">
                          <Badge tone="accent">Public sector</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {customer.city ?? "—"}
                    </td>
                    <td className="tabular px-5 py-3 text-right">
                      {customer._count.contacts}
                    </td>
                    <td className="tabular px-5 py-3 text-right">
                      {customer._count.opportunities}
                    </td>
                    <td className="tabular px-5 py-3 text-right">
                      {customer._count.tenders}
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
