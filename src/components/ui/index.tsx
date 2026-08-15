import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/**
 * Presentational primitives, in the Quiet Console direction.
 *
 * Two rules do most of the work here and are worth stating, because they are
 * easy to break one component at a time:
 *
 *   - Nothing is separated by shadow. Cards are 1px hairlines on a surface,
 *     and the only real shadow in the interface is under the app shell.
 *   - Status is never colour alone. Every tone is paired with an icon or a
 *     word, because a red dot is invisible to a colour-blind estimator and
 *     meaningless on a printed bid pack.
 */

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  /** Makes a card addressable, which the browser suite relies on. */
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded-[14px] border border-border bg-surface ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 className="flex items-center gap-2 text-[15px] font-medium">
          {icon && <Icon name={icon} size={18} className="text-muted" />}
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

type Tone = "default" | "danger" | "warning" | "success" | "info" | "neutral";

const TONE_ICON: Record<Exclude<Tone, "default">, IconName> = {
  danger: "alert",
  warning: "clock",
  success: "checkCircle",
  info: "file",
  neutral: "ban",
};

const TONE_CHIP: Record<Exclude<Tone, "default">, string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
};

/**
 * A headline number.
 *
 * The metric itself is never coloured, however urgent it is: a 40px figure in
 * red reads as an error state rather than as a number that happens to be
 * high. The colour goes on the chip underneath, where it sits next to an icon
 * and a sentence saying what it means.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  icon?: IconName;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <p className="flex items-center gap-2 text-[15px] font-medium">
        {icon && <Icon name={icon} size={18} className="text-muted" />}
        {label}
      </p>
      <p className="tabular text-[40px] font-semibold leading-[1.2] tracking-[-0.02em]">
        {value}
      </p>
      {hint &&
        (tone === "default" ? (
          <p className="text-xs text-muted">{hint}</p>
        ) : (
          <p
            className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${TONE_CHIP[tone]}`}
          >
            <Icon name={TONE_ICON[tone]} size={12} />
            {hint}
          </p>
        ))}
    </Card>
  );
}

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-muted",
  accent: "bg-surface-muted text-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: IconName;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/** Maps a tender status onto a colour, so the register scans at a glance. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "WON":
    case "APPROVED":
      return "success";
    case "PENDING_APPROVAL":
      return "warning";
    case "LOST":
    case "WITHDRAWN":
      return "danger";
    case "SUBMITTED":
      return "info";
    default:
      return "neutral";
  }
}

/**
 * The glyph that carries the same meaning as the colour, for anyone who
 * cannot use the colour.
 */
export function statusIcon(status: string): IconName {
  switch (status) {
    case "WON":
    case "APPROVED":
      return "check";
    case "PENDING_APPROVAL":
      return "clock";
    case "LOST":
    case "WITHDRAWN":
    case "NO_BID":
      return "ban";
    case "SUBMITTED":
      return "checkCircle";
    default:
      return "file";
  }
}

export function EmptyState({
  title,
  description,
  icon = "inbox",
  action,
}: {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
      <Icon name={icon} size={20} className="text-faint" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto max-w-sm text-xs text-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[30px] font-semibold leading-[1.2] tracking-[-0.02em]">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "secondary",
  icon,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  icon?: IconName;
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-foreground border-accent hover:opacity-90"
      : "border-border bg-surface hover:bg-surface-muted";
  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-medium transition ${styles}`}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

/** A labelled value in a definition list. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export { Icon };
export type { IconName };
