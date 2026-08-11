import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession, DEV_USER_COOKIE } from "@/lib/auth/session";
import { withRequestContext } from "@/lib/database/tenant-context";
import { db } from "@/lib/database/client";
import { initials } from "@/lib/format";
import type { PermissionKey } from "@/lib/permissions";

/**
 * The signed-in shell.
 *
 * Navigation is filtered by two things: whether the tenant has the module
 * enabled (ADR-009) and whether the user holds the permission to see it. The
 * filtering here is a courtesy — services enforce the same rules server-side,
 * so a hand-typed URL gets a 403 rather than a page.
 */

interface NavItem {
  href: string;
  label: string;
  moduleKey: string;
  permission: PermissionKey;
}

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    moduleKey: "reports",
    permission: "reports.dashboard.view",
  },
  {
    href: "/tenders",
    label: "Tenders",
    moduleKey: "tenders",
    permission: "tenders.tender.view",
  },
  {
    href: "/approvals",
    label: "Approvals",
    moduleKey: "tenders",
    permission: "tenders.tender.approve",
  },
  {
    href: "/compliance",
    label: "Compliance",
    moduleKey: "core",
    permission: "reports.dashboard.view",
  },
  {
    href: "/audit",
    label: "Audit trail",
    moduleKey: "core",
    permission: "core.audit.view",
  },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const enabledModules = await withRequestContext(
    { organisationId: session.organisationId, userId: session.userId },
    async () => {
      const rows = await db.organisationModule.findMany({
        where: { isEnabled: true },
        select: { moduleKey: true },
      });
      return new Set(rows.map((r) => r.moduleKey));
    },
  );

  const organisation = await withRequestContext(
    { organisationId: session.organisationId, userId: session.userId },
    () =>
      db.organisation.findUnique({
        where: { id: session.organisationId },
        select: { name: true },
      }),
  );

  const visible = NAV.filter(
    (item) =>
      enabledModules.has(item.moduleKey) &&
      session.permissions.has(item.permission),
  );

  async function signOut() {
    "use server";
    const store = await cookies();
    store.delete(DEV_USER_COOKIE);
    redirect("/sign-in");
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/dashboard" className="shrink-0">
            <span className="block text-xs font-semibold uppercase tracking-widest text-accent">
              Nopedi
            </span>
            <span className="block text-[11px] text-muted">
              {organisation?.name}
            </span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-surface-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium leading-tight">
                {session.fullName}
              </p>
              <p className="text-[11px] leading-tight text-muted">
                {session.jobTitle}
              </p>
            </div>
            <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
              {initials(session.fullName)}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:bg-surface-muted hover:text-foreground"
              >
                Switch
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
