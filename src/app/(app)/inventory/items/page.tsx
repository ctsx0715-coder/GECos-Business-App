import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { describeQuantity, formatCents } from "@/lib/format";
import { inventoryService } from "@/modules/inventory/inventory.service";
import { LEVEL_LABELS, levelTone } from "@/modules/inventory/vocabulary";
import { EXPENSE_CATEGORY_LABELS } from "@/modules/procurement/vocabulary";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";

/**
 * The register, with what is on hand against each line.
 *
 * The value column is at average cost and is the figure an accountant would
 * put on a balance sheet. It is shown per item rather than only as a total,
 * because the total is never the interesting number: what a manager wants to
 * know is which three items are most of it.
 */

export const dynamic = "force-dynamic";

export default async function StockRegisterPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("inventory.stock.view")) return null;
    return {
      positions: await inventoryService.listPositions(),
      mayManage: session.permissions.has("inventory.item.manage"),
    };
  });

  if (!data) redirect("/dashboard");

  const total = data.positions.reduce(
    (sum, entry) => sum + entry.position.valueCents,
    0,
  );

  return (
    <>
      <PageHeader
        title="Stock register"
        description="Everything we hold, what is on hand, and what it is worth"
        action={
          data.mayManage && (
            <ButtonLink href="/inventory/items/new" variant="primary" icon="plus">
              Add an item
            </ButtonLink>
          )
        }
      />

      <Card>
        <CardHeader
          title={`${data.positions.length} item${data.positions.length === 1 ? "" : "s"}`}
          description={`${formatCents(total)} on hand at average cost`}
        />
        {data.positions.length === 0 ? (
          <EmptyState
            title="Nothing on the register yet"
            description="An item here is something you count. Plant hire and a subcontractor's labour are ordinary purchase order lines and do not belong on it."
            action={
              data.mayManage && (
                <ButtonLink href="/inventory/items/new" icon="plus">
                  Add the first one
                </ButtonLink>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-faint">
                  <th className="px-5 py-2.5 font-medium">Item</th>
                  <th className="px-5 py-2.5 font-medium">Category</th>
                  <th className="px-5 py-2.5 text-right font-medium">On hand</th>
                  <th className="px-5 py-2.5 text-right font-medium">Average cost</th>
                  <th className="px-5 py-2.5 text-right font-medium">Value</th>
                  <th className="px-5 py-2.5 font-medium">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.positions.map((entry) => (
                  <tr key={entry.item.id}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/inventory/items/${entry.item.id}`}
                        className="font-medium hover:underline"
                      >
                        {entry.item.name}
                      </Link>
                      <div className="text-xs text-faint">
                        {entry.item.code ?? entry.item.reference}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {EXPENSE_CATEGORY_LABELS[entry.item.category]}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {describeQuantity(entry.position.quantity, entry.item.unit)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">
                      {formatCents(entry.position.unitCostCents)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formatCents(entry.position.valueCents)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={levelTone(entry.level)}>
                        {LEVEL_LABELS[entry.level]}
                      </Badge>
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
