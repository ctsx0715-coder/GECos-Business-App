import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  DEV_USER_COOKIE,
  demoAuthEnabled,
  listDevUsers,
} from "@/lib/auth/session";
import { Card, Icon } from "@/components/ui";
import { initials } from "@/lib/format";

/**
 * Development sign-in.
 *
 * Clerk replaces this entirely — it exists so the role gate can be exercised
 * before credentials arrive, and because being able to switch between a Tender
 * Officer and the Managing Director in one click is exactly what makes this a
 * useful discovery tool (docs/01-demo-scope.md).
 *
 * The layout is the theme's split auth screen, but the left half is a user
 * picker rather than an email and password: there are no credentials yet, and
 * a form that looked like it took them would be a lie about what this is.
 */
// Reads the user list from the database at request time, never at build time.
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const users = await listDevUsers();

  async function signIn(formData: FormData) {
    "use server";
    const userId = String(formData.get("userId") ?? "");
    if (!userId) return;
    const store = await cookies();
    store.set(DEV_USER_COOKIE, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    redirect("/dashboard");
  }

  const byOrganisation = new Map<string, typeof users>();
  for (const user of users) {
    const key = user.organisation.name;
    byOrganisation.set(key, [...(byOrganisation.get(key) ?? []), user]);
  }

  return (
    <main className="min-h-dvh p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-[1400px] overflow-hidden rounded-[24px] bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:min-h-[calc(100dvh-2.5rem)] lg:grid-cols-2">
        <div className="flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-[440px]">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-sm font-semibold text-accent-foreground">
                N
              </span>
              <span>
                <span className="block text-sm font-semibold leading-tight tracking-[-0.01em]">
                  Nopedi
                </span>
                <span className="block text-[11px] leading-tight text-faint">
                  Business Operating System
                </span>
              </span>
            </div>

            <h1 className="mt-8 text-[30px] font-semibold leading-[1.2] tracking-[-0.02em]">
              Sign in
            </h1>
            <p className="mt-2 text-sm text-muted">
              Choose who to sign in as. Each role sees a different system —
              Clerk, MFA and SSO replace this screen in Stage 2.
            </p>

            {/*
              Two different failures used to render the same message, which sent
              whoever hit it looking in the wrong place. An empty list means the
              database has no users; the flag being off means the list was never
              queried at all.
            */}
            {!demoAuthEnabled() && (
              <Card className="mt-6 p-5 text-sm">
                <p className="font-medium">Demo sign-in is switched off.</p>
                <p className="mt-2 text-muted">
                  Set <code className="font-mono">NOPEDI_DEMO_AUTH</code> to{" "}
                  <code className="font-mono">true</code> in the environment,
                  then redeploy. On Vercel, environment variables only reach a
                  deployment built after they were added — changing one does not
                  affect the deployment already running.
                </p>
                <p className="mt-2 text-muted">
                  This is not the same as an empty database. Nothing has been
                  queried.
                </p>
              </Card>
            )}

            {demoAuthEnabled() && users.length === 0 && (
              <Card className="mt-6 p-5 text-sm">
                <p className="font-medium">No users in the database.</p>
                <p className="mt-2 text-muted">
                  Demo sign-in is on and the database was reachable, but it
                  holds no users. Run the <strong>Seed database</strong>{" "}
                  workflow in GitHub Actions, or{" "}
                  <code className="font-mono">pnpm db:seed</code> locally.
                </p>
              </Card>
            )}

            <div className="mt-6 space-y-5">
              {[...byOrganisation.entries()].map(([organisation, members]) => (
                <div key={organisation}>
                  <h2 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                    {organisation}
                  </h2>
                  <Card>
                    <ul className="divide-y divide-border">
                      {members.map((user) => (
                        <li key={user.id}>
                          <form action={signIn}>
                            <input
                              type="hidden"
                              name="userId"
                              value={user.id}
                            />
                            <button
                              type="submit"
                              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted"
                            >
                              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-[11px] font-semibold text-muted">
                                {initials(
                                  `${user.firstName} ${user.lastName}`,
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">
                                  {user.firstName} {user.lastName}
                                </span>
                                <span className="block truncate text-xs text-faint">
                                  {user.jobTitle} · {user.email}
                                </span>
                              </span>
                              <Icon name="chevronRight" className="text-faint" />
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/*
          The right half is the canvas showing through the shell. It carries
          the one thing worth saying before you are inside: the tenancy
          boundary is real and you can prove it from this screen.
        */}
        <div className="hidden flex-col justify-center gap-10 overflow-hidden border-l border-border bg-canvas py-12 pl-12 lg:flex">
          <div className="-mr-16 rounded-l-[14px] border border-r-0 border-border bg-surface p-5 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
            <p className="flex items-center gap-2 text-[13px] font-medium">
              <Icon name="target" size={14} className="text-muted" />
              Open pipeline
            </p>
            <p className="tabular mt-3 text-2xl font-semibold tracking-[-0.02em]">
              Two tenants, one database
            </p>
            <ul className="mt-4">
              {[
                "Every table carries an organisation column",
                "A query with no tenant bound throws, not leaks",
                "Nothing is hard deleted, everything is audited",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-center gap-2 border-t border-border py-2.5 text-xs text-muted"
                >
                  <Icon name="check" size={14} className="text-success" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <p className="max-w-[22ch] pr-12 text-[30px] font-normal leading-[1.3] tracking-[-0.02em] text-muted">
            <strong className="font-semibold text-foreground">
              Sign in as Kgosi Civils
            </strong>{" "}
            and confirm that not one of{" "}
            <strong className="font-semibold text-foreground">
              Nopedi&rsquo;s tenders
            </strong>{" "}
            is visible.
          </p>
        </div>
      </div>
    </main>
  );
}
