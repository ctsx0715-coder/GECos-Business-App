import { withSession } from "@/lib/auth/session";
import { db } from "@/lib/database/client";
import { Badge, Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { complianceSummary } from "@/lib/analytics/metrics";
import { formatDate, formatRelativeDays } from "@/lib/format";

/**
 * Company compliance, driven by the shared expiry engine (ADR-004).
 *
 * Status is computed from expiresAt at read time, never stored. The same
 * engine and the same screen shape will serve employee training, medicals,
 * HSE and asset warranties once those modules exist.
 */

function statusFor(expiresAt: Date | null): {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
} {
  if (!expiresAt) return { label: "Not completed", tone: "neutral" };
  const days = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return { label: "Expired", tone: "danger" };
  if (days <= 90) return { label: "Expiring soon", tone: "warning" };
  return { label: "Valid", tone: "success" };
}

export default async function CompliancePage() {
  const { items, summary } = await withSession(async () => ({
    items: await db.complianceItem.findMany({
      orderBy: { expiresAt: "asc" },
      select: {
        id: true,
        requirementName: true,
        category: true,
        issuedAt: true,
        expiresAt: true,
        providerName: true,
      },
    }),
    summary: await complianceSummary(),
  }));

  return (
    <>
      <PageHeader
        title="Compliance"
        description="Status is computed from expiry dates, so it can never go stale"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Valid"
          value={String(summary.valid)}
          hint="More than 90 days remaining"
          tone="success"
        />
        <StatTile
          label="Expiring soon"
          value={String(summary.expiringSoon)}
          hint="Within 90 days"
          tone="warning"
        />
        <StatTile
          label="Expired"
          value={String(summary.expired)}
          hint="Action required now"
          tone="danger"
        />
      </div>

      <Card>
        {items.length === 0 ? (
          <EmptyState
            title="No compliance records"
            description="Certificates, accreditations and insurance policies appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Requirement</th>
                  <th className="px-5 py-3 font-medium">Issued</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const status = statusFor(item.expiresAt);
                  const relative = formatRelativeDays(item.expiresAt);
                  return (
                    <tr key={item.id}>
                      <td className="px-5 py-3">
                        <span className="block font-medium">
                          {item.requirementName}
                        </span>
                        <span className="block text-xs text-muted">
                          {item.providerName}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {formatDate(item.issuedAt)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="block">
                          {formatDate(item.expiresAt)}
                        </span>
                        <span className="block text-xs text-muted">
                          {relative.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-muted">
        Notifications at 90, 60, 30 and 7 days before expiry run from a nightly
        job, which needs a deployment to schedule against.
      </p>
    </>
  );
}
