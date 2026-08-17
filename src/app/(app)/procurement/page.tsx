import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { formatCents, formatCentsExact } from "@/lib/format";
import { procurementService } from "@/modules/procurement/procurement.service";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";

/**
 * What needs somebody today.
 *
 * Ordered by what costs money if it is left: an over-billing first, then goods
 * that arrived in quantities nobody ordered, then the orders sitting in an
 * approver's queue. A procurement dashboard that leads with "12 orders this
 * month" is a report; this is meant to be a to-do list.
 */

export const dynamic = "force-dynamic";

export default async function ProcurementPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("procurement.order.view")) return null;
    return {
      overview: await procurementService.overview(),
      mayCreate: session.permissions.has("procurement.order.create"),
    };
  });

  if (!data) redirect("/dashboard");

  const { overview } = data;
  const needsAttention = [
    ...overview.overBilled,
    ...overview.overDelivered.filter(
      (order) => !overview.overBilled.some((other) => other.id === order.id),
    ),
  ];

  return (
    <>
      <PageHeader
        title="Procurement"
        description="What has been ordered, what arrived, and what we have been billed for"
        action={
          data.mayCreate && (
            <ButtonLink href="/procurement/orders/new" variant="primary" icon="plus">
              Raise an order
            </ButtonLink>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Billed over the goods"
          value={formatCents(overview.overBilledCents)}
          tone={overview.overBilledCents > 0 ? "danger" : "default"}
          hint={
            overview.overBilledCents > 0
              ? `Across ${overview.overBilled.length} order${overview.overBilled.length === 1 ? "" : "s"}`
              : "Every invoice is within tolerance of what arrived"
          }
        />
        <StatTile
          label="Awaiting approval"
          value={String(overview.awaitingApproval)}
          tone={overview.awaitingApproval > 0 ? "warning" : "default"}
          hint="Nothing is committed until somebody signs"
        />
        <StatTile
          label="Live orders"
          value={String(overview.live)}
          hint={`${overview.settled.length} balance and can be closed`}
        />
        <StatTile
          label="Part delivered"
          value={String(overview.partDelivered.length)}
          hint="Still owed by a supplier"
        />
      </div>

      <Card>
        <CardHeader
          title="Needs somebody"
          description="Orders where the three documents do not agree"
        />
        {needsAttention.length === 0 ? (
          <EmptyState
            title="Nothing is out of line"
            description="Every live order has been billed for what actually arrived."
          />
        ) : (
          <ul className="divide-y divide-border">
            {needsAttention.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/procurement/orders/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{order.reference}</span>
                      <span className="text-sm text-muted">{order.supplier.name}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-warning">{order.concerns[0]}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {order.match.overBilledCents > 0 && (
                      <Badge tone="danger" icon="alert">
                        {formatCentsExact(order.match.overBilledCents)}
                      </Badge>
                    )}
                    <span className="text-sm tabular-nums text-muted">
                      {formatCents(order.match.orderedCents)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Still to come"
          description="Approved orders a supplier has not finished delivering"
        />
        {overview.partDelivered.length === 0 ? (
          <EmptyState
            title="Nothing outstanding"
            description="Every approved order has been delivered in full."
          />
        ) : (
          <ul className="divide-y divide-border">
            {overview.partDelivered.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/procurement/orders/${order.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{order.reference}</span>
                      <span className="text-sm text-muted">{order.supplier.name}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {order.concerns[order.concerns.length - 1]}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-muted">
                    {formatCents(order.match.receivedCents)} of{" "}
                    {formatCents(order.match.orderedCents)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
