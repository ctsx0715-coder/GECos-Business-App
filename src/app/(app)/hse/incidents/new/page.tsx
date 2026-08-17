import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hseService } from "@/modules/hse/hse.service";
import { PageHeader } from "@/components/ui";
import { ReportIncidentForm } from "./report-form";

/**
 * Reporting an incident.
 *
 * Reachable by everybody, which is the point. The register behind it is gated
 * — it names injured people and their injuries, which POPIA treats as special
 * personal information — but a near-miss system that asks whether you are
 * allowed to use it collects nothing.
 */

export const dynamic = "force-dynamic";

export default async function ReportIncidentPage() {
  const options = await withSession(async (session) => {
    if (!session.permissions.has("hse.incident.report")) return null;
    return hseService.reportingOptions();
  });

  if (!options) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Report an incident"
        description="Including the ones where nothing happened — those are the warnings"
      />
      <ReportIncidentForm
        projects={options.projects}
        employees={options.employees}
      />
    </>
  );
}
