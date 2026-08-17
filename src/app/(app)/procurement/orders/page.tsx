import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { formatCents, formatDate } from "@/lib/format";
import { procurementService } from "@/modules/procurement/procurement.service";
import {
  billingTone,
  BILLING_LABELS,
  deliveryTone,
  DELIVERY_LABELS,
  ORDER_STATUS_LABELS,
  orderStatusTone,
} from "@/modules/procurement/vocabulary";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";

/**
 * Every order, newest first.
 *
 * Three states per row rather than one, because an order has three lives and
 * they do not move together: where it is in the authorisation chain, how much
 * of it has arrived, and whether the invoice agrees. An order can be approved,
 * fully delivered and badly over-billed all at once, and a single "status"
 * column would have to pick one of those three to tell you.
 */

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("procurement.order.view")) return null;
    return {
      orders: await procurementService.listOrders(),
      mayCreate: session.permissions.has("procurement.order.create"),
    };
  });

  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="What has been ordered, from whom, and against which site"
        action={
          data.mayCreate && (
            <ButtonLink href="/procurement/orders/new" variant="primary" icon="plus">
              Raise an order
            </ButtonLink>
          )
        }
      />

      <Card>
        <CardHeader
          title={`${data.orders.length} order${data.orders.length === 1 ? "" : "s"}`}
          description="A draft is what a site wants. Nothing is committed until it is approved"
        />
        {data.orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Raise one against a supplier that has been cleared."
            action={
              data.mayCreate && (
                <ButtonLink href="/procurement/orders/new" icon="plus">
                  Raise the first one
                </ButtonLink>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/procurement/orders/${order.id}`}
                  className="block px-5 py-4 transition hover:bg-surface-muted"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{order.reference}</span>
                        <Badge tone={orderStatusTone(order.status)}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </Badge>
                        {order.status === "APPROVED" && (
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
                      <p className="mt-1 text-sm text-muted">
                        {order.supplier.name}
                        {order.project && ` · ${order.project.name}`}
                        {order.requiredBy &&
                          ` · needed ${formatDate(order.requiredBy)}`}
                      </p>
                      {order.concerns.length > 0 && order.status === "APPROVED" && (
                        <p className="mt-1 text-xs text-warning">
                          {order.concerns[0]}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="tabular-nums font-medium">
                        {formatCents(order.match.orderedCents)}
                      </div>
                      <div className="text-xs text-faint">
                        {order.lines.length} line
                        {order.lines.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
