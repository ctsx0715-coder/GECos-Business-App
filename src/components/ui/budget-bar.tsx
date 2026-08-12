import { formatCentsCompact } from "@/lib/format";

/**
 * Budget against committed spend.
 *
 * Overruns are drawn as the bar filling past 100% in red rather than simply
 * capping at full, because a bar that stops at the end makes 105% and 200%
 * look identical — which is precisely the distinction a project manager needs.
 */
export function BudgetBar({
  budgetCents,
  committedCents,
  pendingCents = 0n,
  showLabels = true,
}: {
  budgetCents: bigint;
  committedCents: bigint;
  pendingCents?: bigint;
  showLabels?: boolean;
}) {
  const budget = Number(budgetCents);
  const committed = Number(committedCents);
  const pending = Number(pendingCents);

  const percentUsed = budget === 0 ? 0 : Math.round((committed / budget) * 100);
  const over = budget > 0 && committed > budget;

  // The bar is scaled to whichever is larger, so an overrun stays visible.
  const scale = Math.max(budget, committed + pending, 1);
  const committedWidth = (committed / scale) * 100;
  const pendingWidth = (pending / scale) * 100;
  const budgetMark = (budget / scale) * 100;

  return (
    <div>
      {showLabels && (
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="text-muted">
            <span className="tabular font-medium text-foreground">
              {formatCentsCompact(committedCents)}
            </span>{" "}
            of {formatCentsCompact(budgetCents)}
          </span>
          <span
            className={`tabular font-medium ${over ? "text-danger" : "text-muted"}`}
          >
            {percentUsed}%
          </span>
        </div>
      )}

      <div className="relative h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={`absolute inset-y-0 left-0 ${over ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${committedWidth}%` }}
        />
        {pending > 0 && (
          <div
            className="absolute inset-y-0 bg-warning opacity-70"
            style={{ left: `${committedWidth}%`, width: `${pendingWidth}%` }}
          />
        )}
        {/* Where the budget sits, when spend has run past it. */}
        {over && (
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground"
            style={{ left: `${budgetMark}%` }}
          />
        )}
      </div>
    </div>
  );
}
