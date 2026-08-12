import Link from "next/link";
import { notFound } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { crmService } from "@/modules/crm/crm.service";
import { NotFoundError } from "@/lib/errors";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  statusTone,
} from "@/components/ui";
import {
  formatCents,
  formatDate,
  tenderStatusLabel,
} from "@/lib/format";

/**
 * The single customer view.
 *
 * This page is the argument for the whole architecture: contacts, deals and
 * tenders all hang off one customer record created once, rather than the same
 * client being retyped into three modules.
 */
export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const data = await withSession(async () => {
    try {
      return {
        customer: await crmService.getCustomer(id),
        activity: await crmService.activitiesFor("CUSTOMER", id),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

  if (!data) notFound();
  const { customer, activity } = data;

  const openDeals = customer.opportunities.filter((o) =>
    ["QUALIFIED", "PROPOSAL", "NEGOTIATION"].includes(o.stage),
  );

  return (
    <>
      <div className="mb-4">
        <Link href="/crm/customers" className="text-xs text-muted hover:underline">
          ← Customers
        </Link>
      </div>

      <PageHeader
        title={customer.name}
        description={customer.city ?? undefined}
        action={
          customer.isPublicSector ? (
            <Badge tone="accent">Public sector</Badge>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Opportunities"
              description={`${openDeals.length} open of ${customer.opportunities.length}`}
            />
            {customer.opportunities.length === 0 ? (
              <EmptyState
                title="No deals yet"
                description="Opportunities for this customer appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {customer.opportunities.map((deal) => (
                  <li key={deal.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/crm/opportunities/${deal.id}`}
                        className="block text-sm font-medium hover:underline"
                      >
                        {deal.title}
                      </Link>
                      <span className="block text-xs text-muted">
                        {deal.owner
                          ? `${deal.owner.firstName} ${deal.owner.lastName}`
                          : "Unassigned"}
                        {deal.expectedCloseAt &&
                          ` · closes ${formatDate(deal.expectedCloseAt)}`}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {formatCents(deal.valueCents)}
                    </span>
                    <Badge
                      tone={
                        deal.stage === "WON"
                          ? "success"
                          : deal.stage === "LOST"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {deal.stage.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Tenders"
              description="Bids submitted to this client"
            />
            {customer.tenders.length === 0 ? (
              <EmptyState
                title="No tenders"
                description="Tenders raised against this customer appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {customer.tenders.map((tender) => (
                  <li key={tender.id} className="flex items-center gap-3 px-5 py-3">
                    <Link
                      href={`/tenders/${tender.id}`}
                      className="tabular shrink-0 text-xs font-medium text-accent hover:underline"
                    >
                      {tender.reference}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {tender.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {formatDate(tender.closingAt)}
                    </span>
                    <Badge tone={statusTone(tender.status)}>
                      {tenderStatusLabel(tender.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity" description="Calls, meetings and notes" />
            {activity.length === 0 ? (
              <EmptyState
                title="Nothing logged"
                description="Contact history with this customer appears here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{entry.subject}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDate(entry.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {entry.type.toLowerCase().replace("_", " ")}
                      {entry.owner &&
                        ` · ${entry.owner.firstName} ${entry.owner.lastName}`}
                    </p>
                    {entry.body && (
                      <p className="mt-1 text-sm text-muted">{entry.body}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="grid gap-4 px-5 py-4">
              <Field label="Registration">
                {customer.registrationNumber ?? "—"}
              </Field>
              <Field label="VAT number">{customer.vatNumber ?? "—"}</Field>
              <Field label="Email">{customer.email ?? "—"}</Field>
              <Field label="Phone">{customer.phone ?? "—"}</Field>
              <Field label="Location">
                {[customer.city, customer.province, customer.countryCode]
                  .filter(Boolean)
                  .join(", ")}
              </Field>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Contacts"
              description={`${customer.contacts.length} on record`}
            />
            {customer.contacts.length === 0 ? (
              <EmptyState
                title="No contacts"
                description="People at this customer appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {customer.contacts.map((contact) => (
                  <li key={contact.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {contact.firstName} {contact.lastName}
                      </span>
                      {contact.isPrimary && <Badge tone="accent">Primary</Badge>}
                    </div>
                    <p className="text-xs text-muted">{contact.jobTitle}</p>
                    {contact.email && (
                      <p className="text-xs text-muted">{contact.email}</p>
                    )}
                    {contact.phone && (
                      <p className="text-xs text-muted">{contact.phone}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
