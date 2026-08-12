import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { formChoices } from "../../../create-actions";
import { LeadForm } from "../../new-forms";

export default async function NewLeadPage() {
  const session = await withSession(async (s) => s);
  if (!session.permissions.has("crm.lead.create")) redirect("/dashboard");

  const { users } = await formChoices();

  return (
    <>
      <div className="mb-4">
        <Link href="/crm/leads" className="text-xs text-muted hover:underline">
          ← Leads
        </Link>
      </div>
      <PageHeader
        title="New lead"
        description="Capture an enquiry before it is qualified"
      />
      <div className="max-w-3xl">
        <LeadForm users={users} />
      </div>
    </>
  );
}
