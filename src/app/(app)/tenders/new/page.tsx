import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { formChoices } from "../../create-actions";
import { TenderForm } from "./tender-form";

export default async function NewTenderPage() {
  const session = await withSession(async (session) => session);
  if (!session.permissions.has("tenders.tender.create")) redirect("/dashboard");

  const { customers, users } = await formChoices();

  return (
    <>
      <div className="mb-4">
        <Link href="/tenders" className="text-xs text-muted hover:underline">
          ← Tender register
        </Link>
      </div>
      <PageHeader
        title="New tender"
        description="Add a bid to the register and start its checklist"
      />
      <div className="max-w-3xl">
        <TenderForm customers={customers} users={users} />
      </div>
    </>
  );
}
