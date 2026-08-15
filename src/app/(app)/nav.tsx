"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icons";

/**
 * The sidebar and the breadcrumb.
 *
 * Client components only because both need the current path. Everything they
 * render is decided on the server and passed in already filtered by module
 * and permission — nothing here knows what a permission is, and nothing here
 * can widen what a user sees.
 */

export interface NavLeaf {
  href: string;
  label: string;
  icon: IconName;
}

export interface NavNode extends NavLeaf {
  /** Present on a parent; the parent's own href is then the first child's. */
  children?: NavLeaf[];
}

export interface NavGroup {
  label: string;
  items: NavNode[];
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const LEAF =
  "flex min-h-[38px] items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-sm font-medium transition-colors";

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-4" aria-label="Main">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            {group.label}
          </p>

          {group.items.map((item) =>
            item.children ? (
              <NavBranch key={item.label} item={item} pathname={pathname} />
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={`${LEAF} ${
                  isActive(pathname, item.href)
                    ? "border-border bg-surface-muted text-foreground"
                    : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}

/**
 * A group of nested pages.
 *
 * <details> rather than state, so the disclosure works before hydration and
 * costs nothing to run. It opens by default when one of its children is the
 * page you are on.
 */
function NavBranch({ item, pathname }: { item: NavNode; pathname: string }) {
  const children = item.children ?? [];
  const hasActiveChild = children.some((child) => isActive(pathname, child.href));

  return (
    <details open={hasActiveChild || undefined} className="group">
      <summary
        className={`${LEAF} cursor-pointer list-none text-muted marker:content-none hover:bg-surface-muted hover:text-foreground`}
      >
        <Icon name={item.icon} />
        {item.label}
        <Icon
          name="chevronDown"
          className="ml-auto transition-transform group-open:rotate-180"
        />
      </summary>

      {/*
        The connector trunk stops 19px short of the bottom, which is the
        centre of the last child — so the line ends at the last item rather
        than running past it.
      */}
      <div className="relative ml-[19px] flex flex-col gap-0.5 pl-3.5 before:absolute before:bottom-[19px] before:left-0 before:top-0 before:w-px before:bg-border">
        {children.map((child) => (
          <Link
            key={child.href}
            href={child.href}
            aria-current={isActive(pathname, child.href) ? "page" : undefined}
            className={`relative flex min-h-[34px] items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors before:absolute before:-left-3.5 before:top-1/2 before:h-px before:w-2.5 before:bg-border ${
              isActive(pathname, child.href)
                ? "bg-surface-muted text-foreground"
                : "text-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            {child.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

/** Organisation, then where you are. Nothing deeper: the tree is two levels. */
export function Breadcrumb({
  organisation,
  groups,
}: {
  organisation: string;
  groups: NavGroup[];
}) {
  const pathname = usePathname();

  const flat: Array<{ href: string; label: string; parent?: string }> = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (item.children) {
        for (const child of item.children) {
          flat.push({ href: child.href, label: child.label, parent: item.label });
        }
      } else {
        flat.push({ href: item.href, label: item.label });
      }
    }
  }

  const here = flat.find((item) => isActive(pathname, item.href));

  return (
    <nav
      className="flex min-w-0 items-center gap-2 text-[13px] text-faint"
      aria-label="Breadcrumb"
    >
      <span className="truncate">{organisation}</span>
      {here?.parent && (
        <>
          <Icon name="chevronRight" size={14} />
          <span className="truncate">{here.parent}</span>
        </>
      )}
      <Icon name="chevronRight" size={14} />
      <span className="truncate font-medium text-foreground">
        {here?.label ?? "Nopedi"}
      </span>
    </nav>
  );
}
