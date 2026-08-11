import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import { tenderService } from "@/modules/tenders/tender.service";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  statusTone,
} from "@/components/ui";
import {
  formatCents,
  formatDate,
  formatRelativeDays,
  tenderStatusLabel,
} from "@/lib/format";
import type { TenderStatus } from "@/generated/prisma/client";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "awaiting", label: "Awaiting approval" },
  { key: "closing", label: "Closing this week" },
  { key: "closed", label: "Closed" },
] as const;

const LIVE: TenderStatus[] = [
  "IDENTIFIED",
  "IN_PROGRESS",
  "PENDING_APPROVAL",
  "APPROVED",
];
const CLOSED: TenderStatus[] = ["WON", "LOST", "NO_BID", "WITHDRAWN"];

export default async function TendersPage(props: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter = "live", q } = await props.searchParams;

  const { rows, total } = await withSession(() => {
    const base = { search: q };
    switch (filter) {
      case "awaiting":
        return tenderService.list(
          { ...base, status: ["PENDING_APPROVAL"] },
          { take: 100 },
        );
      case "closing":
        return tenderService.list(
          { ...base, status: LIVE, closingWithinDays: 7 },
          { take: 100 },
        );
      case "closed":
        return tenderService.list({ ...base, status: CLOSED }, { take: 100 });
      case "all":
        return tenderService.list(base, { take: 100 });
      default:
        return tenderService.list({ ...base, status: LIVE }, { take: 100 });
    }
  });

  return (
    <>
      <PageHeader
        title="Tender register"
        description={`${total} tender${total === 1 ? "" : "s"} matching this view`}
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map((option) => {
          const active = option.key === filter;
          return (
            <Link
              key={option.key}
              href={`/tenders?filter=${option.key}`}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No tenders in this view"
            description="Try a different filter, or add a tender to the register."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">Tender</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 text-right font-medium">Value</th>
                  <th className="px-5 py-3 font-medium">Closing</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((tender) => {
                  const closing = formatRelativeDays(tender.closingAt);
                  const urgent = closing.days >= 0 && closing.days <= 7;
                  return (
                    <tr
                      key={tender.id}
                      className="transition hover:bg-surface-muted"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/tenders/${tender.id}`}
                          className="tabular font-medium text-accent hover:underline"
                        >
                          {tender.reference}
                        </Link>
                      </td>
                      <td className="max-w-xs px-5 py-3">
                        <Link
                          href={`/tenders/${tender.id}`}
                          className="block truncate hover:underline"
                        >
                          {tender.title}
                        </Link>
                        <span className="block text-xs text-muted">
                          {tender.industry}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {tender.customer?.name ?? "—"}
                      </td>
                      <td className="tabular px-5 py-3 text-right">
                        {formatCents(tender.estimatedValueCents)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="block">
                          {formatDate(tender.closingAt)}
                        </span>
                        <span
                          className={`block text-xs ${urgent ? "font-medium text-danger" : "text-muted"}`}
                        >
                          {closing.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone(tender.status)}>
                          {tenderStatusLabel(tender.status)}
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
