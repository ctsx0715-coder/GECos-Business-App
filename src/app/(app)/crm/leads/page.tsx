import Link from "next/link";
import { withSession } from "@/lib/auth/session";
import { crmService } from "@/modules/crm/crm.service";
import { leadFunnel } from "@/lib/analytics/metrics";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatCents, formatDate } from "@/lib/format";
import { LeadActions } from "./convert-form";
import type { LeadStatus } from "@/generated/prisma/client";

const STATUS_TONES: Record<string, "neutral" | "accent" | "success" | "danger"> =
  {
    NEW: "accent",
    CONTACTED: "neutral",
    QUALIFIED: "success",
    CONVERTED: "success",
    DISQUALIFIED: "danger",
  };

const SOURCE_LABELS: Record<string, string> = {
  REFERRAL: "Referral",
  WEBSITE: "Website",
  TENDER_PORTAL: "Tender portal",
  COLD_OUTREACH: "Cold outreach",
  EXISTING_CLIENT: "Existing client",
  EVENT: "Event",
  OTHER: "Other",
};

export default async function LeadsPage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "open" } = await props.searchParams;

  const filter: LeadStatus[] | undefined =
    status === "open"
      ? ["NEW", "CONTACTED", "QUALIFIED"]
      : status === "converted"
        ? ["CONVERTED"]
        : status === "disqualified"
          ? ["DISQUALIFIED"]
          : undefined;

  const { leads, customers, funnel, session } = await withSession(
    async (session) => ({
      leads: await crmService.listLeads(filter),
      customers: await crmService.listCustomers(),
      funnel: await leadFunnel(),
      session,
    }),
  );

  const canConvert = session.permissions.has("crm.lead.convert");
  const customerOptions = customers.map((c) => ({ id: c.id, name: c.name }));

  const tabs = [
    { key: "open", label: "Open" },
    { key: "converted", label: "Converted" },
    { key: "disqualified", label: "Disqualified" },
    { key: "all", label: "All" },
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        description="Enquiries before they enter the pipeline"
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={`/crm/leads?status=${tab.key}`}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                tab.key === status
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          {funnel.map((row) => (
            <span key={row.status}>
              {row.status.toLowerCase()}:{" "}
              <span className="tabular font-medium text-foreground">
                {row.count}
              </span>
            </span>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <Card>
          <EmptyState
            title="No leads in this view"
            description="Enquiries appear here before they are qualified into the pipeline."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            // The id makes a single lead addressable, which the browser suite
            // needs in order to act on a specific card rather than whichever
            // one happens to be first.
            <Card key={lead.id} id={`lead-${lead.reference}`} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="tabular text-xs text-muted">
                      {lead.reference}
                    </span>
                    <Badge tone={STATUS_TONES[lead.status] ?? "neutral"}>
                      {lead.status.toLowerCase()}
                    </Badge>
                  </div>
                  <h2 className="mt-1 text-sm font-semibold">
                    {lead.companyName}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {lead.contactName ?? "No named contact"}
                    {lead.email && ` · ${lead.email}`}
                    {" · "}
                    {SOURCE_LABELS[lead.source] ?? lead.source}
                    {" · "}
                    {formatDate(lead.createdAt)}
                  </p>
                  {lead.description && (
                    <p className="mt-2 max-w-2xl text-sm text-muted">
                      {lead.description}
                    </p>
                  )}
                  {lead.disqualifiedReason && (
                    <p className="mt-2 text-xs text-danger">
                      Disqualified: {lead.disqualifiedReason}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    Estimated
                  </p>
                  <p className="tabular text-lg font-semibold">
                    {formatCents(lead.estimatedValueCents)}
                  </p>
                  {lead.owner && (
                    <p className="text-xs text-muted">
                      {lead.owner.firstName} {lead.owner.lastName}
                    </p>
                  )}
                </div>
              </div>

              {lead.convertedOpportunityId && (
                <p className="mt-3 text-xs text-muted">
                  Converted to{" "}
                  <Link
                    href={`/crm/opportunities/${lead.convertedOpportunityId}`}
                    className="text-accent hover:underline"
                  >
                    {lead.convertedOpportunity?.reference}
                  </Link>{" "}
                  for {lead.convertedCustomer?.name}
                </p>
              )}

              <div className="mt-3 border-t border-border pt-3">
                <LeadActions
                  leadId={lead.id}
                  companyName={lead.companyName}
                  status={lead.status}
                  customers={customerOptions}
                  canConvert={canConvert}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
