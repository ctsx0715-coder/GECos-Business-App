import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "../../new-forms";

export default async function NewCustomerPage() {
  const session = await withSession(async (s) => s);
  if (!session.permissions.has("crm.customer.create")) redirect("/dashboard");

  return (
    <>
      <div className="mb-4">
        <Link href="/crm/customers" className="text-xs text-muted hover:underline">
          ← Customers
        </Link>
      </div>
      <PageHeader
        title="New customer"
        description="Created once, then available to tenders, deals and projects"
      />
      <div className="max-w-3xl">
        <CustomerForm />
      </div>
    </>
  );
}
