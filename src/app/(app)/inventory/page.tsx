import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { describeQuantity, formatCents, formatDate } from "@/lib/format";
import { inventoryService } from "@/modules/inventory/inventory.service";
import {
  COUNT_STATUS_LABELS,
  MOVEMENT_LABELS,
  countStatusTone,
  movementTone,
} from "@/modules/inventory/vocabulary";
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
 * Ordered by what a wrong answer costs, which is not the same as by size. A
 * ledger that says less than nothing comes first however small the item is,
 * because it is the only entry on the page that says the register itself
 * cannot be trusted — every other figure here is read off the same ledger, so
 * until that is fixed nobody knows whether the rest of the page is true.
 *
 * The value of the yard is a tile rather than the headline. It is the number
 * an accountant wants and the one a storeman can do nothing about.
 */

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("inventory.stock.view")) return null;
    return {
      overview: await inventoryService.overview(),
      mayManage: session.permissions.has("inventory.item.manage"),
    };
  });

  if (!data) redirect("/dashboard");

  const { overview } = data;
  const needsAttention = [...overview.impossible, ...overview.suspect];

  return (
    <>
      <PageHeader
        title="Stock"
        description="What is in the stores, what has left them, and what does not add up"
        action={
          data.mayManage && (
            <ButtonLink href="/inventory/items/new" variant="primary" icon="plus">
              Add an item
            </ButtonLink>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Value on hand"
          value={formatCents(overview.valueCents)}
          hint={`Across ${overview.itemCount} item${overview.itemCount === 1 ? "" : "s"}, at average cost`}
        />
        <StatTile
          label="Does not add up"
          value={String(needsAttention.length)}
          tone={needsAttention.length > 0 ? "danger" : "default"}
          hint={
            needsAttention.length > 0
              ? "A delivery has gone unrecorded somewhere"
              : "Every balance is possible"
          }
        />
        <StatTile
          label="Running low"
          value={String(overview.low.length)}
          tone={overview.low.length > 0 ? "warning" : "default"}
          hint={`${overview.out.length} with none on hand at all`}
        />
        <StatTile
          label="Counts to accept"
          value={String(overview.awaitingAcceptance.length)}
          tone={overview.awaitingAcceptance.length > 0 ? "warning" : "default"}
          /*
           * Two facts, and the hint has to say the right one. A tile reading
           * "1" over "Nothing waiting on a signature" is the sort of
           * contradiction that costs a reader their trust in every other
           * number on the page.
           */
          hint={
            overview.awaitingAcceptance.length > 0
              ? overview.counting.length > 0
                ? `${overview.counting.length} more still being counted`
                : "Nobody outside the store has looked at them yet"
              : overview.counting.length > 0
                ? `${overview.counting.length} still being counted`
                : "Nothing waiting on a signature"
          }
        />
      </div>

      <Card>
        <CardHeader
          title="Does not add up"
          description="Balances that are impossible in a yard, so a delivery was never recorded"
        />
        {needsAttention.length === 0 ? (
          <EmptyState
            title="Nothing impossible"
            description="No store has issued more of anything than it was ever given."
            icon="checkCircle"
          />
        ) : (
          <ul className="divide-y divide-border">
            {needsAttention.map((entry) => (
              <li key={entry.item.id}>
                <Link
                  href={`/inventory/items/${entry.item.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.item.name}</span>
                      <span className="text-xs text-faint">
                        {entry.item.reference}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-danger">{entry.concerns[0]}</p>
                  </div>
                  <span className="text-sm tabular-nums text-muted">
                    {describeQuantity(entry.position.quantity, entry.item.unit)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Needs buying"
          description="Down to the reorder level, with the quantity that puts it right"
          action={
            <ButtonLink href="/inventory/items">The whole register</ButtonLink>
          }
        />
        {overview.low.length === 0 && overview.out.length === 0 ? (
          <EmptyState
            title="Nothing is running out"
            description="Every item with a reorder level is above it."
            icon="checkCircle"
          />
        ) : (
          <ul className="divide-y divide-border">
            {[...overview.out, ...overview.low].map((entry) => (
              <li key={entry.item.id}>
                <Link
                  href={`/inventory/items/${entry.item.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.item.name}</span>
                      <Badge tone={entry.level === "OUT" ? "danger" : "warning"}>
                        {describeQuantity(entry.position.quantity, entry.item.unit)}
                      </Badge>
                    </div>
                    {entry.concerns.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted">{entry.concerns[0]}</p>
                    )}
                  </div>
                  {entry.suggestedOrderQuantity !== null && (
                    <span className="text-sm text-muted">
                      Order{" "}
                      {describeQuantity(
                        entry.suggestedOrderQuantity,
                        entry.item.unit,
                      )}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {overview.awaitingAcceptance.length > 0 && (
        <Card>
          <CardHeader
            title="Counts waiting on somebody"
            description="Handed in, and not yet checked by anybody other than the counter"
          />
          <ul className="divide-y divide-border">
            {overview.awaitingAcceptance.map((count) => (
              <li key={count.id}>
                <Link
                  href={`/inventory/counts/${count.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-surface-muted"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{count.reference}</span>
                      <span className="text-sm text-muted">
                        {count.stockLocation.name}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Counted {formatDate(count.countedOn)}
                    </p>
                  </div>
                  <Badge tone={countStatusTone(count.status)}>
                    {COUNT_STATUS_LABELS[count.status]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Last twelve movements"
          description="Everything that has gone in or out of a store"
        />
        {overview.recentMovements.length === 0 ? (
          <EmptyState
            title="Nothing has moved"
            description="Stock appears here as soon as a delivery is signed for against an order."
          />
        ) : (
          <ul className="divide-y divide-border">
            {overview.recentMovements.map((movement) => (
              <li
                key={movement.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={movementTone(movement.kind)}>
                      {MOVEMENT_LABELS[movement.kind]}
                    </Badge>
                    <Link
                      href={`/inventory/items/${movement.stockItemId}`}
                      className="font-medium hover:underline"
                    >
                      {movement.stockItem.name}
                    </Link>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {movement.fromLocation?.name ?? "—"} →{" "}
                    {movement.toLocation?.name ?? movement.project?.name ?? "—"}
                    {movement.reason && ` · ${movement.reason}`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm tabular-nums">
                    {describeQuantity(
                      Number(movement.quantity),
                      movement.stockItem.unit,
                    )}
                  </div>
                  <div className="text-xs text-faint">
                    {formatDate(movement.movedAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
