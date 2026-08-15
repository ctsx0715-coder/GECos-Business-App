import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession, demoAuthEnabled, DEV_USER_COOKIE } from "@/lib/auth/session";
import { withRequestContext } from "@/lib/database/tenant-context";
import { db } from "@/lib/database/client";
import { initials } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import type { IconName } from "@/components/ui/icons";
import type { PermissionKey } from "@/lib/permissions";
import { Breadcrumb, SidebarNav, type NavGroup } from "./nav";

/**
 * The signed-in shell.
 *
 * The application does not fill the viewport: it sits as one rounded surface
 * floating on a warm canvas, with the sidebar, the breadcrumb bar and the
 * content region inside it.
 *
 * Navigation is filtered by two things: whether the tenant has the module
 * enabled (ADR-009) and whether the user holds the permission to see it. The
 * filtering here is a courtesy — services enforce the same rules server-side,
 * so a hand-typed URL gets a 403 rather than a page.
 */

/**
 * Everything behind sign-in is per user and per tenant, so none of it may be
 * statically prerendered or shared between requests.
 *
 * Without this, Next decides dynamism by observing whether a dynamic API such
 * as cookies() was called — which here depended on whether demo auth happened
 * to be switched on. That is far too subtle a thing for cache correctness in a
 * multi-tenant app to rest on: get it wrong and one tenant is served another's
 * cached page. Stating it outright removes the question.
 */
export const dynamic = "force-dynamic";

/**
 * The preview group is deliberately its own heading rather than a badge on a
 * normal item. A demonstration screen that sits in the nav looking exactly
 * like a built one is how a client ends up believing they bought it.
 */
type GroupKey = "main" | "cycles" | "insights" | "preview" | "support";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  moduleKey: string;
  /**
   * Omitted for a screen that shows a person only their own record. There is
   * no permission for being yourself, and inventing one would mean an
   * administrator could take it away and leave somebody unable to read their
   * own leave balance.
   */
  permission?: PermissionKey;
  group: GroupKey;
  /** Shown only when the signed-in user has an employee record. */
  needsEmployeeRecord?: boolean;
  /** Items sharing a parent are nested under it with tree connectors. */
  parent?: { label: string; icon: IconName };
}

const CUSTOMERS = { label: "Customers & sales", icon: "users" as const };
const TENDERS = { label: "Tenders", icon: "file" as const };
const PEOPLE = { label: "People", icon: "userPlus" as const };

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "grid",
    moduleKey: "reports",
    permission: "reports.dashboard.view",
    group: "main",
  },
  {
    href: "/crm/pipeline",
    label: "Pipeline",
    icon: "target",
    moduleKey: "crm",
    permission: "crm.opportunity.view",
    group: "main",
    parent: CUSTOMERS,
  },
  {
    href: "/crm/leads",
    label: "Leads",
    icon: "userPlus",
    moduleKey: "crm",
    permission: "crm.lead.view",
    group: "main",
    parent: CUSTOMERS,
  },
  {
    href: "/crm/customers",
    label: "Customers",
    icon: "building",
    moduleKey: "crm",
    permission: "crm.customer.view",
    group: "main",
    parent: CUSTOMERS,
  },
  {
    href: "/tenders",
    label: "Register",
    icon: "file",
    moduleKey: "tenders",
    permission: "tenders.tender.view",
    group: "main",
    parent: TENDERS,
  },
  {
    href: "/approvals",
    label: "Approvals",
    icon: "inbox",
    moduleKey: "tenders",
    permission: "tenders.tender.approve",
    group: "main",
    parent: TENDERS,
  },
  {
    href: "/projects",
    label: "Projects",
    icon: "folder",
    moduleKey: "projects",
    permission: "projects.project.view",
    group: "main",
  },
  {
    href: "/hr/me",
    label: "My record",
    icon: "userPlus",
    moduleKey: "hr",
    group: "main",
    needsEmployeeRecord: true,
    parent: PEOPLE,
  },
  {
    href: "/hr/employees",
    label: "Register",
    icon: "users",
    moduleKey: "hr",
    permission: "hr.employee.view",
    group: "main",
    parent: PEOPLE,
  },
  {
    href: "/hr/leave",
    label: "Leave",
    icon: "calendar",
    moduleKey: "hr",
    permission: "hr.leave.view",
    group: "main",
    parent: PEOPLE,
  },
  {
    href: "/hr/roster",
    label: "Roster",
    icon: "grid",
    moduleKey: "hr",
    permission: "hr.roster.view",
    group: "cycles",
  },
  {
    href: "/hr/shifts",
    label: "Shifts",
    icon: "clock",
    moduleKey: "hr",
    permission: "hr.leave.configure",
    group: "cycles",
  },
  {
    href: "/hr/work-patterns",
    label: "Work patterns",
    icon: "clock",
    moduleKey: "hr",
    permission: "hr.leave.configure",
    group: "cycles",
  },
  {
    href: "/hr/leave/holidays",
    label: "Public holidays",
    icon: "calendar",
    moduleKey: "hr",
    permission: "hr.leave.configure",
    group: "cycles",
  },
  {
    href: "/hr/leave/types",
    label: "Leave policy",
    icon: "shield",
    moduleKey: "hr",
    permission: "hr.leave.configure",
    group: "main",
    parent: PEOPLE,
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "trend",
    moduleKey: "reports",
    permission: "reports.dashboard.view",
    group: "insights",
  },
  {
    href: "/compliance",
    label: "Compliance",
    icon: "shield",
    moduleKey: "core",
    permission: "reports.dashboard.view",
    group: "insights",
  },
  {
    href: "/audit",
    label: "Audit trail",
    icon: "history",
    moduleKey: "core",
    permission: "core.audit.view",
    group: "support",
  },
  {
    href: "/preview",
    label: "Tender lifecycle",
    icon: "compass",
    moduleKey: "tenders",
    permission: "tenders.tender.view",
    group: "preview",
  },
];

const GROUP_LABELS: Record<GroupKey, string> = {
  main: "Main navigation",
  cycles: "Work cycles",
  insights: "Analytics & insights",
  preview: "Not built yet",
  support: "Support",
};

/**
 * Folds the flat list into groups, collapsing runs of items that share a
 * parent into one branch. A parent whose children were all filtered away
 * disappears with them rather than becoming an empty disclosure.
 */
function buildGroups(visible: NavItem[]): NavGroup[] {
  return (["main", "cycles", "insights", "preview", "support"] as GroupKey[])
    .map((key) => {
      const items: NavGroup["items"] = [];

      for (const item of visible.filter((i) => i.group === key)) {
        if (!item.parent) {
          items.push({ href: item.href, label: item.label, icon: item.icon });
          continue;
        }

        const existing = items.find((i) => i.label === item.parent!.label);
        const child = { href: item.href, label: item.label, icon: item.icon };

        if (existing?.children) {
          existing.children.push(child);
        } else {
          items.push({
            href: item.href,
            label: item.parent.label,
            icon: item.parent.icon,
            children: [child],
          });
        }
      }

      return { label: GROUP_LABELS[key], items };
    })
    .filter((group) => group.items.length > 0);
}

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

  /*
   * One extra query, and only when the tenant runs HR: whether this login is
   * also on the payroll. It decides a single nav item, and there is no
   * permission that could answer it — being an employee is a fact about the
   * person, not a right somebody granted them.
   */
  const hasEmployeeRecord = enabledModules.has("hr")
    ? await withRequestContext(
        { organisationId: session.organisationId, userId: session.userId },
        async () =>
          (await db.employee.count({ where: { userId: session.userId } })) > 0,
      )
    : false;

  const groups = buildGroups(
    NAV.filter(
      (item) =>
        enabledModules.has(item.moduleKey) &&
        (item.permission === undefined ||
          session.permissions.has(item.permission)) &&
        (!item.needsEmployeeRecord || hasEmployeeRecord),
    ),
  );

  async function signOut() {
    "use server";
    const store = await cookies();
    store.delete(DEV_USER_COOKIE);
    redirect("/sign-in");
  }

  return (
    <div className="min-h-dvh p-3 sm:p-5">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 overflow-hidden rounded-[24px] bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.06)] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-lg px-1 py-1"
          >
            <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-sm font-semibold text-accent-foreground">
              N
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight tracking-[-0.01em]">
                Nopedi
              </span>
              <span className="block truncate text-[11px] leading-tight text-faint">
                {organisation?.name}
              </span>
            </span>
          </Link>

          <SidebarNav groups={groups} />

          <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-muted p-2">
            <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
              {initials(session.fullName)}
              <span className="absolute -bottom-px -right-px size-[9px] rounded-full border-2 border-surface-muted bg-success" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-tight">
                {session.fullName}
              </span>
              <span className="block truncate text-[11px] leading-tight text-faint">
                {session.jobTitle}
              </span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                title="Switch user"
                aria-label="Switch user"
                className="grid size-8 place-items-center rounded-lg text-faint transition-colors hover:bg-surface hover:text-foreground"
              >
                <Icon name="logOut" />
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="flex h-14 items-center gap-3 border-b border-border px-5">
            <Breadcrumb
              organisation={organisation?.name ?? "Nopedi"}
              groups={groups}
            />
            <span className="ml-auto hidden text-[13px] text-faint sm:block">
              {session.roleNames.join(" · ")}
            </span>
          </div>

          {demoAuthEnabled() && (
            <p className="flex items-center gap-2 border-b border-border bg-surface-muted px-5 py-2 text-xs text-muted">
              <Icon name="alert" className="text-warning" />
              <span>
                <strong className="font-semibold text-foreground">
                  Demo sign-in is enabled.
                </strong>{" "}
                Anyone who can reach this deployment can sign in as any user.
                Not for real data.
              </span>
            </p>
          )}

          <main className="px-5 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
