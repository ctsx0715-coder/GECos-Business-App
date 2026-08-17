import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { describeQuantity } from "@/lib/format";
import { inventoryService } from "@/modules/inventory/inventory.service";
import { projectService } from "@/modules/projects/project.service";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { AddStoreInline, MakeDefault } from "./manage";

/**
 * Where stock is kept.
 *
 * A store on a site carries its project, which is what lets "what is left on
 * the Mamelodi job" be a question with an answer when the job finishes. The
 * count of distinct items in each store is on the row because it is the only
 * thing that distinguishes a store somebody forgot to close from one that is
 * genuinely empty.
 */

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("inventory.stock.view")) return null;
    return {
      stores: await inventoryService.listLocations(),
      positions: await inventoryService.listPositions(),
      projects: session.permissions.has("projects.project.view")
        ? await projectService.list(["PLANNING", "ACTIVE", "ON_HOLD"])
        : [],
      mayManage: session.permissions.has("inventory.location.manage"),
    };
  });

  if (!data) redirect("/dashboard");

  /** What each store holds, folded out of the positions we already have. */
  const held = new Map<string, { items: number; unitsAcross: string[] }>();
  for (const entry of data.positions) {
    for (const [locationId, quantity] of entry.position.byLocation) {
      if (Math.abs(quantity) < 0.0005) continue;
      const current = held.get(locationId) ?? { items: 0, unitsAcross: [] };
      current.items += 1;
      current.unitsAcross.push(
        `${describeQuantity(quantity, entry.item.unit)} ${entry.item.name}`,
      );
      held.set(locationId, current);
    }
  }

  return (
    <>
      <PageHeader
        title="Stores"
        description="The yard, the site containers, and wherever else stock sits"
      />

      <Card>
        <CardHeader
          title={`${data.stores.length} store${data.stores.length === 1 ? "" : "s"}`}
          description="Exactly one is where a delivery lands when nobody says otherwise"
          action={
            data.mayManage && data.stores.length > 0 ? (
              <AddStoreInline
                projects={data.projects.map((project) => ({
                  value: project.id,
                  label: `${project.reference} · ${project.name}`,
                }))}
              />
            ) : undefined
          }
        />
        {data.stores.length === 0 ? (
          <EmptyState
            title="No stores yet"
            description="Nothing can be put away until there is somewhere to put it. Until then a delivery is recorded against its order and stops there."
            action={
              data.mayManage && (
                <AddStoreInline
                  projects={data.projects.map((project) => ({
                    value: project.id,
                    label: `${project.reference} · ${project.name}`,
                  }))}
                />
              )
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.stores.map((store) => {
              const contents = held.get(store.id);
              return (
                <li
                  key={store.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{store.name}</span>
                      {store.isDefault && (
                        <Badge tone="accent" icon="inbox">
                          Deliveries land here
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {store.project ? (
                        <Link
                          href={`/projects/${store.project.id}`}
                          className="hover:underline"
                        >
                          {store.project.reference} · {store.project.name}
                        </Link>
                      ) : (
                        "Not on a site"
                      )}
                      {store.address && ` · ${store.address}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted">
                      {contents
                        ? `${contents.items} item${contents.items === 1 ? "" : "s"}`
                        : "Empty"}
                    </span>
                    {data.mayManage && !store.isDefault && (
                      <MakeDefault
                        id={store.id}
                        name={store.name}
                        projectId={store.projectId}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
