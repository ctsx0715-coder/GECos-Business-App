import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/database/client";
import { formChoices } from "../../../create-actions";
import { OpportunityForm } from "../../new-forms";

export default async function NewOpportunityPage() {
  const session = await withSession(async (s) => s);
  if (!session.permissions.has("crm.opportunity.create")) {
    redirect("/dashboard");
  }

  const { customers, users } = await formChoices();

  // Any live tender can back a deal, not only won ones.
  const tenders = await withSession(() =>
    db.tender.findMany({
      orderBy: { closingAt: "asc" },
      select: { id: true, reference: true, title: true },
      take: 100,
    }),
  );

  return (
    <>
      <div className="mb-4">
        <Link href="/crm/pipeline" className="text-xs text-muted hover:underline">
          ← Pipeline
        </Link>
      </div>
      <PageHeader
        title="New opportunity"
        description="A qualified deal, straight into the pipeline"
      />
      <div className="max-w-3xl">
        <OpportunityForm
          customers={customers}
          users={users}
          tenders={tenders.map((t) => ({
            value: t.id,
            label: `${t.reference} — ${t.title}`,
          }))}
        />
      </div>
    </>
  );
}
