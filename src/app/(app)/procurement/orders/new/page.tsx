import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { procurementService } from "@/modules/procurement/procurement.service";
import { projectService } from "@/modules/projects/project.service";
import { Card, EmptyState, ButtonLink, PageHeader } from "@/components/ui";
import { OrderForm } from "./order-form";

/**
 * Raising one.
 *
 * Only cleared suppliers are offered. Showing the unvetted ones and refusing
 * on submit would be technically correct and useless — the buyer has typed the
 * whole order by then.
 */

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("procurement.order.create")) return null;
    return {
      suppliers: await procurementService.listSuppliers(["APPROVED"]),
      projects: session.permissions.has("projects.project.view")
        ? await projectService.list()
        : [],
    };
  });

  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Raise an order"
        description="A draft until somebody approves it. Nothing is committed here"
      />

      {data.suppliers.length === 0 ? (
        <Card>
          <EmptyState
            title="No cleared suppliers"
            description="An order can only be raised against a supplier somebody has vetted. Add one to the register and have it cleared first."
            action={
              <ButtonLink href="/procurement/suppliers" icon="building">
                The supplier register
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <OrderForm
          suppliers={data.suppliers.map((supplier) => ({
            value: supplier.id,
            label: supplier.name,
          }))}
          projects={data.projects.map((project) => ({
            value: project.id,
            label: `${project.reference} · ${project.name}`,
          }))}
        />
      )}
    </>
  );
}
