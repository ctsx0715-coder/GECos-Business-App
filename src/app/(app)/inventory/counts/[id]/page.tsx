import { notFound, redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { describeQuantity, formatCents, formatCentsExact, formatDate } from "@/lib/format";
import { inventoryService } from "@/modules/inventory/inventory.service";
import {
  COUNT_STATUS_LABELS,
  countStatusTone,
} from "@/modules/inventory/vocabulary";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { AbandonCount, AcceptCount, CountTheStore, HandInCount } from "./manage";

/**
 * One stocktake.
 *
 * The screen has two faces, and which one it shows is the whole design. While
 * it is being counted, it is a list of items and an empty box next to each —
 * and it deliberately does not say what the ledger expects, because a counter
 * who can see the answer will arrive at it. Once it has been handed in, the
 * figures are frozen and the same page becomes the variance somebody is being
 * asked to sign.
 */

export const dynamic = "force-dynamic";

export default async function StockCountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await withSession(async (session) => {
    if (!session.permissions.has("inventory.count.view")) return null;
    try {
      return {
        count: await inventoryService.getCount(id),
        positions: await inventoryService.listPositions(),
        mayCount: session.permissions.has("inventory.count.record"),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return "missing" as const;
      throw error;
    }
  });

  if (!data) redirect("/dashboard");
  if (data === "missing") notFound();

  const { count } = data;
  const counting = count.status === "DRAFT";
  const decided = count.status === "ACCEPTED" || count.status === "ABANDONED";

  const alreadyCounted = new Map(
    count.lines.map((line) => [line.stockItemId, line.countedQuantity.toString()]),
  );

  /** Everything on the register, with whatever has already been written down. */
  const countable = data.positions.map((entry) => ({
    id: entry.item.id,
    name: entry.item.name,
    unit: entry.item.unit,
    reference: entry.item.code ?? entry.item.reference,
    counted: alreadyCounted.get(entry.item.id) ?? "",
  }));

  const unitOf = new Map(
    data.positions.map((entry) => [entry.item.id, entry.item.unit]),
  );
  const nameOf = new Map(
    data.positions.map((entry) => [entry.item.id, entry.item.name]),
  );

  return (
    <>
      <PageHeader
        title={`Stocktake ${count.reference}`}
        description={`${count.stockLocation.name} · counted ${formatDate(count.countedOn)}`}
        action={
          <Badge tone={countStatusTone(count.status)}>
            {COUNT_STATUS_LABELS[count.status]}
          </Badge>
        }
      />

      {!counting && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Short"
            value={formatCents(count.variance.shortfallCents)}
            tone={count.variance.shortfallCents > 0 ? "danger" : "default"}
            hint="Material the ledger says was there and is not"
          />
          <StatTile
            label="Over"
            value={formatCents(count.variance.surplusCents)}
            tone={count.variance.surplusCents > 0 ? "warning" : "default"}
            hint="Material that is there and the ledger did not know about"
          />
          <StatTile
            label="Lines that disagree"
            value={`${count.variance.discrepancies.length} of ${count.lines.length}`}
            hint={count.varianceSummary}
          />
          <StatTile
            label="Net"
            value={formatCents(count.variance.netCents)}
            hint="Shown last on purpose: a net of nothing can hide two problems"
          />
        </div>
      )}

      <Card>
        <CardHeader title="The count" />
        <dl className="grid gap-4 px-5 py-4 sm:grid-cols-4">
          <Field label="Store">{count.stockLocation.name}</Field>
          <Field label="Counted by">
            {count.countedByEmployee
              ? `${count.countedByEmployee.firstName} ${count.countedByEmployee.lastName}`
              : "Nobody named"}
          </Field>
          <Field label="Handed in by">
            {count.submittedBy
              ? `${count.submittedBy.firstName} ${count.submittedBy.lastName}`
              : "—"}
          </Field>
          <Field label="Accepted by">
            {count.acceptedBy
              ? `${count.acceptedBy.firstName} ${count.acceptedBy.lastName}`
              : "—"}
          </Field>
          {count.abandonedReason && (
            <div className="sm:col-span-4">
              <Field label="Given up on because">{count.abandonedReason}</Field>
            </div>
          )}
          {count.note && (
            <div className="sm:col-span-4">
              <Field label="Note">
                <span className="whitespace-pre-line">{count.note}</span>
              </Field>
            </div>
          )}
        </dl>
      </Card>

      {counting ? (
        <Card>
          <CardHeader
            title="What is on the shelf"
            description="Write down what you find. What the ledger expects is deliberately not shown until this is handed in"
          />
          {countable.length === 0 ? (
            <EmptyState
              title="Nothing on the register"
              description="There has to be something to count before a store can be counted."
            />
          ) : data.mayCount ? (
            <CountTheStore countId={count.id} items={countable} />
          ) : (
            <EmptyState
              title="Being counted"
              description="Somebody is walking the racks. The variance appears once it is handed in."
              icon="clock"
            />
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="What it found"
            description="Frozen when the count was handed in, so the figures cannot move under whoever accepts them"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-faint">
                  <th className="px-5 py-2.5 font-medium">Item</th>
                  <th className="px-5 py-2.5 text-right font-medium">Ledger said</th>
                  <th className="px-5 py-2.5 text-right font-medium">Counted</th>
                  <th className="px-5 py-2.5 text-right font-medium">Difference</th>
                  <th className="px-5 py-2.5 text-right font-medium">Worth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {count.variance.lines.map((line) => {
                  const unit = unitOf.get(line.stockItemId) ?? "each";
                  const agrees = Math.abs(line.varianceQuantity) < 0.0005;
                  return (
                    <tr key={line.stockItemId}>
                      <td className="px-5 py-3 font-medium">
                        {nameOf.get(line.stockItemId) ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted">
                        {describeQuantity(line.expectedQuantity, unit)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {describeQuantity(line.countedQuantity, unit)}
                      </td>
                      <td
                        className={`px-5 py-3 text-right tabular-nums ${
                          agrees
                            ? "text-faint"
                            : line.varianceQuantity < 0
                              ? "text-danger"
                              : "text-warning"
                        }`}
                      >
                        {agrees
                          ? "—"
                          : `${line.varianceQuantity > 0 ? "+" : ""}${describeQuantity(line.varianceQuantity, unit)}`}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted">
                        {agrees ? "—" : formatCentsExact(line.varianceCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!decided && (
        <Card>
          <CardHeader
            title={counting ? "When you are finished" : "The decision"}
            description={
              counting
                ? "Handing it in freezes the figures and passes it to somebody else"
                : "Accepting writes the difference into the ledger as movements somebody signed"
            }
          />
          <div className="space-y-4 px-5 py-4">
            {counting
              ? data.mayCount && <HandInCount countId={count.id} />
              : count.canAccept && (
                  <AcceptCount
                    countId={count.id}
                    shortfall={count.variance.shortfallCents > 0}
                  />
                )}

            {counting && !data.mayCount && (
              <p className="text-sm text-muted">
                Waiting on whoever is counting the store.
              </p>
            )}
            {!counting && !count.canAccept && (
              <p className="text-sm text-muted">
                Waiting on somebody who can accept a count. Deliberately not the
                person who handed it in.
              </p>
            )}

            {(counting ? data.mayCount : count.canAccept) && (
              <AbandonCount countId={count.id} />
            )}
          </div>
        </Card>
      )}
    </>
  );
}
