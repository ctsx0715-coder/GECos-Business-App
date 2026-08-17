import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { StockItemForm } from "./item-form";

export const dynamic = "force-dynamic";

export default async function NewStockItemPage() {
  const allowed = await withSession(async (session) =>
    session.permissions.has("inventory.item.manage"),
  );

  if (!allowed) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Add a stock item"
        description="It starts at nothing. Stock arrives by a delivery being signed for against a purchase order"
      />
      <StockItemForm />
    </>
  );
}
