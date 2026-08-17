import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { hrService } from "@/modules/hr/hr.service";
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
  PageHeader,
} from "@/components/ui";
import { StartCountInline } from "./manage";

/**
 * Stocktakes.
 *
 * The variance is on the row rather than behind a click, because it is the
 * only reason to read this list at all — and it is shown as a shortfall and a
 * surplus rather than as a net, because a count four thousand rand short on
 * cement and four thousand over on sand nets to nothing and is two serious
 * problems.
 */

export const dynamic = "force-dynamic";

export default async function StockCountsPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("inventory.count.view")) return null;
    return {
      counts: await inventoryService.listCounts(),
      stores: await inventoryService.listLocations(),
      employees: session.permissions.has("hr.employee.view")
        ? await hrService.listEmployees(["ACTIVE"])
        : [],
      mayCount: session.permissions.has("inventory.count.record"),
    };
  });

  if (!data) redirect("/dashboard");

  const start = data.mayCount ? (
    <StartCountInline
      stores={data.stores.map((store) => ({
        value: store.id,
        label: store.name,
      }))}
      employees={data.employees.map((employee) => ({
        value: employee.id,
        label: `${employee.firstName} ${employee.lastName}`,
      }))}
    />
  ) : undefined;

  return (
    <>
      <PageHeader
        title="Stocktakes"
        description="What was physically on the shelf, against what the ledger said"
      />

      <Card>
        <CardHeader
          title={`${data.counts.length} count${data.counts.length === 1 ? "" : "s"}`}
          description="A count is only accepted by somebody other than whoever handed it in"
          action={data.counts.length > 0 ? start : undefined}
        />
        {data.counts.length === 0 ? (
          <EmptyState
            title="Nothing has been counted"
            description={
              data.stores.length === 0
                ? "Open a store first. There is nothing to count until stock has somewhere to sit."
                : "A contractor who never counts the yard has no idea whether the material went onto the job or into somebody's bakkie."
            }
            action={start}
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.counts.map((count) => (
              <li key={count.id}>
                <Link
                  href={`/inventory/counts/${count.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{count.reference}</span>
                      <span className="text-sm text-muted">
                        {count.stockLocation.name}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Counted {formatDate(count.countedOn)}
                      {count.countedByEmployee &&
                        ` by ${count.countedByEmployee.firstName} ${count.countedByEmployee.lastName}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {count.status !== "DRAFT" && (
                      <span
                        className={`text-sm ${
                          count.variance.shortfallCents > 0
                            ? "text-danger"
                            : "text-muted"
                        }`}
                      >
                        {count.varianceSummary}
                      </span>
                    )}
                    <Badge tone={countStatusTone(count.status)}>
                      {COUNT_STATUS_LABELS[count.status]}
                    </Badge>
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
