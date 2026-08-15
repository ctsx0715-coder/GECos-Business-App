import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, Icon } from "@/components/ui";
import { STATE_LABELS, STATE_TONES, type StageState } from "@/lib/preview/lifecycle";

/**
 * Presentational pieces used only by the lifecycle preview.
 *
 * Kept apart from the shared primitives on purpose: everything in here exists
 * to say "this screen is a proposal, not a working feature", and none of it
 * should quietly leak into the built modules.
 */

/** The standing warning at the top of every preview screen. */
export function PreviewBanner({
  children = "Nothing on this screen is saved, and the figures are demonstration data.",
}: {
  children?: ReactNode;
}) {
  /*
   * A hairline strip on a sunk surface rather than a block of colour. The
   * theme keeps colour for data, so the warning carries its weight through
   * the icon and the wording instead of a yellow panel.
   */
  return (
    <div className="mb-6 flex items-start gap-2.5 rounded-[14px] border border-border bg-surface-muted px-4 py-3">
      <Icon name="alert" className="mt-0.5 text-warning" />
      <p className="text-xs leading-relaxed text-muted">
        <strong className="font-semibold text-foreground">
          Preview — designed, not built.
        </strong>{" "}
        {children}
      </p>
    </div>
  );
}

export function StateBadge({ state }: { state: StageState }) {
  return <Badge tone={STATE_TONES[state]}>{STATE_LABELS[state]}</Badge>;
}

/**
 * A block that depends on a module nobody has built yet.
 *
 * Naming the dependency matters more than the placeholder: "coming soon" with
 * no reason reads as an excuse, and "waiting on Finance" reads as a plan.
 */
export function ComingSoon({
  title,
  dependsOn,
  children,
}: {
  title: string;
  dependsOn?: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-muted">{title}</h3>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">
            {children}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Badge tone="neutral">Coming soon</Badge>
          {dependsOn && (
            <p className="mt-1.5 text-[11px] text-muted">Needs {dependsOn}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** A labelled bar. Used for scores, readiness and evaluation points. */
export function Meter({
  value,
  max = 100,
  tone = "accent",
  label,
  caption,
}: {
  value: number;
  max?: number;
  tone?: "accent" | "success" | "warning" | "danger";
  label?: string;
  caption?: string;
}) {
  const percent = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const fill = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];

  return (
    <div>
      {(label || caption) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          {label && <span className="text-muted">{label}</span>}
          {caption && (
            <span className="tabular shrink-0 font-medium">{caption}</span>
          )}
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * A big number with a ring around it, for a single headline score.
 * SVG rather than a border trick, so it stays round at any size and prints.
 */
export function ScoreRing({
  value,
  max = 100,
  caption,
  suffix,
  tone = "accent",
}: {
  value: number;
  max?: number;
  caption?: string;
  /** Unit shown against the number, e.g. "%". Without it a percentage reads as a count. */
  suffix?: string;
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  const percent = max === 0 ? 0 : Math.min(1, value / max);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const stroke = {
    accent: "stroke-accent",
    success: "stroke-success",
    warning: "stroke-warning",
    danger: "stroke-danger",
  }[tone];
  const text = {
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <div className="relative inline-flex size-28 items-center justify-center">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          className="stroke-border"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent)}
        />
      </svg>
      <span className="absolute flex flex-col items-center">
        <span className={`tabular text-2xl font-semibold ${text}`}>
          {value}
          {suffix && <span className="text-base">{suffix}</span>}
        </span>
        {caption && (
          <span className="text-[10px] uppercase tracking-wide text-muted">
            {caption}
          </span>
        )}
      </span>
    </div>
  );
}

/** The sub-navigation across the preview screens. */
export function PreviewNav({
  items,
  current,
}: {
  items: { href: string; label: string }[];
  current: string;
}) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-border pb-3">
      {items.map((item) => {
        const active = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Table shell, so the preview tables do not each reinvent the styling. */
export function DataTable({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            {head}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
