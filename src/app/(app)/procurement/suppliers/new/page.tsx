import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { SupplierForm } from "./supplier-form";

export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  const allowed = await withSession(async (session) =>
    session.permissions.has("procurement.supplier.manage"),
  );

  if (!allowed) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Add a supplier"
        description="They go on the register unvetted. Somebody else clears them before anything can be ordered"
      />
      <SupplierForm />
    </>
  );
}
