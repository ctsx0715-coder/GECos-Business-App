import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { procurementService } from "@/modules/procurement/procurement.service";
import {
  bbbeeLabel,
  SUPPLIER_STATUS_LABELS,
  supplierStatusTone,
} from "@/modules/procurement/vocabulary";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { SupplierDecision } from "./manage";

/**
 * Who we are allowed to buy from.
 *
 * Two columns here are not decoration. A lapsed tax clearance is the client's
 * problem on a public-sector contract and therefore ours, and the B-BBEE level
 * is what a tender asks about a year later when nobody can reconstruct it from
 * the invoices. Both are on the row rather than behind a click, because the
 * moment somebody needs them is the moment they are choosing a supplier.
 */

export const dynamic = "force-dynamic";

export default async function SupplierRegisterPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("procurement.supplier.view")) return null;
    return {
      suppliers: await procurementService.listSuppliers(),
      mayManage: session.permissions.has("procurement.supplier.manage"),
      mayVet: session.permissions.has("procurement.supplier.approve"),
    };
  });

  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="The register, and whether each one has been cleared to buy from"
        action={
          data.mayManage && (
            <ButtonLink
              href="/procurement/suppliers/new"
              variant="primary"
              icon="plus"
            >
              Add a supplier
            </ButtonLink>
          )
        }
      />

      <Card>
        <CardHeader
          title={`${data.suppliers.length} supplier${data.suppliers.length === 1 ? "" : "s"}`}
          description="Nothing can be ordered from one that has not been cleared"
        />
        {data.suppliers.length === 0 ? (
          <EmptyState
            title="Nobody on the register yet"
            description="A purchase order needs a supplier that somebody has vetted."
            action={
              data.mayManage && (
                <ButtonLink href="/procurement/suppliers/new" icon="plus">
                  Add the first one
                </ButtonLink>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-faint">
                  <th className="px-5 py-2.5 font-medium">Supplier</th>
                  <th className="px-5 py-2.5 font-medium">Supplies</th>
                  <th className="px-5 py-2.5 font-medium">B-BBEE</th>
                  <th className="px-5 py-2.5 font-medium">Tax clearance</th>
                  <th className="px-5 py-2.5 font-medium">Orders</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{supplier.name}</div>
                      <div className="text-xs text-faint">{supplier.reference}</div>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {supplier.supplies.length > 0
                        ? supplier.supplies.join(", ")
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {bbbeeLabel(supplier.bbbeeLevel)}
                    </td>
                    <td className="px-5 py-3">
                      {supplier.taxClearanceExpiresAt ? (
                        supplier.taxClearanceLapsed ? (
                          <Badge tone="danger" icon="alert">
                            Lapsed {formatDate(supplier.taxClearanceExpiresAt)}
                          </Badge>
                        ) : (
                          <span className="text-muted">
                            {formatDate(supplier.taxClearanceExpiresAt)}
                          </span>
                        )
                      ) : (
                        <span className="text-faint">Not held</span>
                      )}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted">
                      {supplier._count.purchaseOrders}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={supplierStatusTone(supplier.status)}>
                          {SUPPLIER_STATUS_LABELS[supplier.status]}
                        </Badge>
                        {data.mayVet && (
                          <SupplierDecision
                            id={supplier.id}
                            name={supplier.name}
                            status={supplier.status}
                          />
                        )}
                      </div>
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
