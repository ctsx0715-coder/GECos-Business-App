import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { describeQuantity, formatCents, formatDate } from "@/lib/format";
import { hrService } from "@/modules/hr/hr.service";
import { inventoryService } from "@/modules/inventory/inventory.service";
import { projectService } from "@/modules/projects/project.service";
import {
  LEVEL_LABELS,
  MOVEMENT_LABELS,
  levelTone,
  movementTone,
} from "@/modules/inventory/vocabulary";
import { EXPENSE_CATEGORY_LABELS } from "@/modules/procurement/vocabulary";
import { NotFoundError } from "@/lib/errors";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { AdjustStock, IssueStock, ReturnStock, TransferStock } from "./manage";

/**
 * One item: where it is, what it is worth, and everything that has happened to it.
 *
 * The movement list is the whole record and is shown in full rather than
 * paged, because the question somebody brings to this screen is almost always
 * "where did it go", and that is answered by reading down the list rather than
 * by a summary. The store-by-store breakdown sits above it: an item can be
 * comfortably in stock overall and out of it on the site that needs it.
 */

export const dynamic = "force-dynamic";

export default async function StockItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await withSession(async (session) => {
    if (!session.permissions.has("inventory.item.view")) return null;

    try {
      const detail = await inventoryService.getItem(id);
      return {
        detail,
        projects: session.permissions.has("projects.project.view")
          ? await projectService.list(["PLANNING", "ACTIVE", "ON_HOLD"])
          : [],
        employees: session.permissions.has("hr.employee.view")
          ? await hrService.listEmployees(["ACTIVE"])
          : [],
        mayIssue: session.permissions.has("inventory.stock.issue"),
        mayTransfer: session.permissions.has("inventory.stock.transfer"),
        mayAdjust: session.permissions.has("inventory.stock.adjust"),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return "missing" as const;
      throw error;
    }
  });

  if (!data) redirect("/dashboard");
  if (data === "missing") notFound();

  const { detail } = data;
  const { item, position, level } = detail;

  const stores = detail.locations.map((location) => ({
    value: location.id,
    label: location.name,
  }));
  const projects = data.projects.map((project) => ({
    value: project.id,
    label: `${project.reference} · ${project.name}`,
  }));
  const employees = data.employees.map((employee) => ({
    value: employee.id,
    label: `${employee.firstName} ${employee.lastName}`,
  }));

  /*
   * Stores with nothing in them are still listed, as long as the item has been
   * there. "Mamelodi site store: none" is the answer to a real question, and
   * dropping the row leaves the reader unable to tell it from a store they
   * never sent any to.
   */
  const byStore = detail.locations
    .map((location) => ({
      location,
      quantity: position.byLocation.get(location.id) ?? 0,
      known: position.byLocation.has(location.id),
    }))
    .filter((row) => row.known);

  return (
    <>
      <PageHeader
        title={item.name}
        description={`${item.reference}${item.code ? ` · ${item.code}` : ""} · counted in ${item.unit}`}
      />

      {detail.concerns.length > 0 && (
        <Card className="mb-4 flex items-start gap-2 px-5 py-4">
          <Icon
            name="alert"
            className={
              position.quantity < 0 ? "mt-0.5 text-danger" : "mt-0.5 text-warning"
            }
          />
          <div className="text-sm">
            {detail.concerns.map((concern) => (
              <p key={concern}>{concern}</p>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="On hand"
          value={describeQuantity(position.quantity, item.unit)}
          tone={
            position.quantity < 0 ? "danger" : level === "LOW" ? "warning" : "default"
          }
          hint={LEVEL_LABELS[level]}
        />
        <StatTile
          label="Value"
          value={formatCents(position.valueCents)}
          hint={`${formatCents(position.unitCostCents)} each, at average cost`}
        />
        <StatTile
          label="Reorder at"
          value={
            item.reorderLevel === null
              ? "—"
              : describeQuantity(Number(item.reorderLevel), item.unit)
          }
          hint={
            detail.suggestedOrderQuantity === null
              ? "No level set, so it never appears on a buying list"
              : `Order ${describeQuantity(detail.suggestedOrderQuantity, item.unit)}`
          }
        />
        <StatTile
          label="Last moved"
          value={position.lastMovedAt ? formatDate(position.lastMovedAt) : "—"}
          hint={`${detail.movements.length} movement${detail.movements.length === 1 ? "" : "s"} on record`}
        />
      </div>

      <Card>
        <CardHeader title="Where it is" description="On hand in each store" />
        {byStore.length === 0 ? (
          <EmptyState
            title="It has never been in a store"
            description="Stock appears here when a delivery is signed for against a purchase order that names this item, and the receipt names a store."
          />
        ) : (
          <ul className="divide-y divide-border">
            {byStore.map((row) => (
              <li
                key={row.location.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <span className="font-medium">{row.location.name}</span>
                  {row.location.project && (
                    <span className="ml-2 text-xs text-muted">
                      {row.location.project.reference}
                    </span>
                  )}
                </div>
                <span
                  className={`text-sm tabular-nums ${row.quantity < 0 ? "text-danger" : ""}`}
                >
                  {describeQuantity(row.quantity, item.unit)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {stores.length > 0 &&
          (data.mayIssue || data.mayTransfer || data.mayAdjust) && (
            <div className="flex flex-wrap items-start gap-4 border-t border-border px-5 py-4">
              {data.mayIssue && (
                <>
                  <IssueStock
                    stockItemId={item.id}
                    unit={item.unit}
                    stores={stores}
                    projects={projects}
                    employees={employees}
                  />
                  <ReturnStock
                    stockItemId={item.id}
                    unit={item.unit}
                    stores={stores}
                    projects={projects}
                  />
                </>
              )}
              {data.mayTransfer && stores.length > 1 && (
                <TransferStock
                  stockItemId={item.id}
                  unit={item.unit}
                  stores={stores}
                />
              )}
              {data.mayAdjust && (
                <AdjustStock
                  stockItemId={item.id}
                  unit={item.unit}
                  stores={stores}
                />
              )}
            </div>
          )}
      </Card>

      <Card>
        <CardHeader title="The item" />
        <dl className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          <Field label="Category">
            {EXPENSE_CATEGORY_LABELS[item.category]}
          </Field>
          <Field label="Counted in">{item.unit}</Field>
          <Field label="Level">
            <Badge tone={levelTone(level)}>{LEVEL_LABELS[level]}</Badge>
          </Field>
          {item.description && (
            <div className="sm:col-span-3">
              <Field label="Description">{item.description}</Field>
            </div>
          )}
          {item.notes && (
            <div className="sm:col-span-3">
              <Field label="Notes">
                <span className="whitespace-pre-line">{item.notes}</span>
              </Field>
            </div>
          )}
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Everything that has happened to it"
          description="Oldest first, because the balance is read down the column"
        />
        {detail.movements.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="No delivery has been put away and nothing has been issued."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-faint">
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">What</th>
                  <th className="px-5 py-2.5 font-medium">From</th>
                  <th className="px-5 py-2.5 font-medium">To</th>
                  <th className="px-5 py-2.5 text-right font-medium">Quantity</th>
                  <th className="px-5 py-2.5 font-medium">Against</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-5 py-3 text-muted">
                      {formatDate(movement.movedAt)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={movementTone(movement.kind)}>
                        {MOVEMENT_LABELS[movement.kind]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {movement.fromLocation?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {movement.toLocation?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {describeQuantity(Number(movement.quantity), item.unit)}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted">
                      {movement.goodsReceipt ? (
                        <Link
                          href={`/procurement/orders/${movement.goodsReceipt.purchaseOrder.id}`}
                          className="hover:underline"
                        >
                          {movement.goodsReceipt.purchaseOrder.reference}
                        </Link>
                      ) : movement.project ? (
                        <Link
                          href={`/projects/${movement.project.id}`}
                          className="hover:underline"
                        >
                          {movement.project.name}
                        </Link>
                      ) : (
                        movement.reason ?? "—"
                      )}
                      {movement.issuedToEmployee && (
                        <span className="block text-faint">
                          {movement.issuedToEmployee.firstName}{" "}
                          {movement.issuedToEmployee.lastName}
                        </span>
                      )}
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
