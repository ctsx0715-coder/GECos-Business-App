import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DEV_USER_COOKIE, listDevUsers } from "@/lib/auth/session";
import { Card } from "@/components/ui";
import { initials } from "@/lib/format";

/**
 * Development sign-in.
 *
 * Clerk replaces this entirely — it exists so the role gate can be exercised
 * before credentials arrive, and because being able to switch between a Tender
 * Officer and the Managing Director in one click is exactly what makes this a
 * useful discovery tool (docs/01-demo-scope.md).
 */
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
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          Nopedi
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Business Operating System
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Development sign-in. Choose who to sign in as — each role sees a
          different system. Clerk, MFA and SSO replace this screen in Stage 2.
        </p>
      </div>

      {users.length === 0 && (
        <Card className="px-5 py-8 text-center text-sm text-muted">
          No users found. Run <code className="font-mono">pnpm db:seed</code>{" "}
          first.
        </Card>
      )}

      <div className="space-y-6">
        {[...byOrganisation.entries()].map(([organisation, members]) => (
          <div key={organisation}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {organisation}
            </h2>
            <Card>
              <ul className="divide-y divide-border">
                {members.map((user) => (
                  <li key={user.id}>
                    <form action={signIn}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-surface-muted"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                          {initials(`${user.firstName} ${user.lastName}`)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {user.firstName} {user.lastName}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {user.jobTitle} · {user.email}
                          </span>
                        </span>
                        <span className="hidden text-xs text-muted sm:block">
                          {user.roles.map((r) => r.role.name).join(", ")}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-muted">
        Two organisations are seeded deliberately. Sign in as Kgosi Civils to
        confirm that none of Nopedi&rsquo;s tenders are visible.
      </p>
    </main>
  );
}
