import {
  Badge,
  Card,
  CardHeader,
  Field,
  PageHeader,
  StatTile,
} from "@/components/ui";
import {
  ComingSoon,
  DataTable,
  PreviewBanner,
  PreviewNav,
} from "@/components/ui/preview";
import { PREVIEW_NAV } from "@/lib/preview/nav";
import {
  EXPERIENCE,
  KEY_PERSONNEL,
  READINESS,
  type ReadinessState,
} from "@/lib/preview/demo-data";
import { formatCents, formatDate } from "@/lib/format";

/**
 * Sections 1, 2, 15 and 16 — being able to bid at all.
 *
 * Everything a buyer asks for before they will look at a price: the statutory
 * pack, insurance, industry registrations, supplier-database registration, the
 * people whose CVs carry the functionality points, and the finished jobs the
 * experience requirement is answered with.
 *
 * The compliance module already runs the expiry engine behind this. What is
 * previewed is the shape: a statutory pack modelled by type rather than a flat
 * list, and validity checked against a tender's closing date rather than today.
 */

const STATE_META: Record<
  ReadinessState,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  valid: { label: "Valid", tone: "success" },
  expiring: { label: "Expiring", tone: "warning" },
  expired: { label: "Expired", tone: "danger" },
  missing: { label: "Not held", tone: "neutral" },
};

export default function ReadinessPage() {
  const all = READINESS.flatMap((group) => group.items);
  const counts = {
    valid: all.filter((i) => i.state === "valid").length,
    expiring: all.filter((i) => i.state === "expiring").length,
    expired: all.filter((i) => i.state === "expired").length,
    missing: all.filter((i) => i.state === "missing").length,
  };

  return (
    <>
      <PageHeader
        title="Tender readiness"
        description="The company file a buyer checks before they read your price"
      />

      <PreviewNav items={PREVIEW_NAV} current="/preview/readiness" />

      <PreviewBanner>
        The expiry engine behind this is live and already drives the compliance
        register. What is previewed here is the structure — a statutory pack
        modelled by document type, and validity tested against a tender&apos;s
        closing date rather than against today.
      </PreviewBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Valid" value={String(counts.valid)} hint="In date" tone="success" />
        <StatTile
          label="Expiring"
          value={String(counts.expiring)}
          hint="Within 90 days"
          tone="warning"
        />
        <StatTile
          label="Expired"
          value={String(counts.expired)}
          hint="Blocks a submission today"
          tone="danger"
        />
        <StatTile label="Not held" value={String(counts.missing)} hint="Would need obtaining" />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Company profile"
          description="Entered once, pulled into every submission"
        />
        <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Registered name">Nopedi Trading & Projects (Pty) Ltd</Field>
          <Field label="Registration number">2014/118273/07</Field>
          <Field label="VAT number">4290287731</Field>
          <Field label="BBBEE status">Level 1 · 135% recognition · 100% black owned</Field>
          <Field label="Years in operation">12</Field>
          <Field label="Employees">64 permanent · 38 contract</Field>
          <Field label="Core services">
            Electrical infrastructure · public lighting · term maintenance
          </Field>
          <Field label="Operating regions">Gauteng · North West · Mpumalanga</Field>
          <Field label="Average annual turnover">R41.2m over 3 years</Field>
        </dl>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {READINESS.map((group) => (
          <Card key={group.key}>
            <CardHeader title={group.title} description={group.description} />
            <ul className="divide-y divide-border">
              {group.items.map((item) => {
                const meta = STATE_META[item.state];
                return (
                  <li
                    key={item.name}
                    className="flex items-start justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted">
                        {item.reference ?? item.detail ?? "—"}
                        {item.reference && item.detail && ` · ${item.detail}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {item.expiresAt && (
                        <p className="mt-1 text-[11px] text-muted">
                          {formatDate(item.expiresAt)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="mt-6" id="personnel">
        <CardHeader
          title="Key personnel"
          description="Section 15 — most tenders score the people, not just the company"
        />
        <DataTable
          head={
            <>
              <th className="px-5 py-3 font-medium">Person</th>
              <th className="px-5 py-3 font-medium">Proposed role</th>
              <th className="px-5 py-3 font-medium">Qualification</th>
              <th className="px-5 py-3 font-medium">Registration</th>
              <th className="px-5 py-3 text-right font-medium">Years</th>
              <th className="px-5 py-3 font-medium">Availability</th>
              <th className="px-5 py-3 font-medium">CV</th>
            </>
          }
        >
          {KEY_PERSONNEL.map((person) => {
            const stale = person.cvIsStale;
            return (
              <tr key={person.name} className="transition hover:bg-surface-muted">
                <td className="px-5 py-3 font-medium">{person.name}</td>
                <td className="px-5 py-3 text-muted">{person.role}</td>
                <td className="px-5 py-3 text-muted">{person.qualification}</td>
                <td className="px-5 py-3 text-muted">
                  {person.registration ?? "—"}
                </td>
                <td className="tabular px-5 py-3 text-right">
                  {person.yearsExperience}
                </td>
                <td className="px-5 py-3 text-xs text-muted">
                  {person.availability}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={stale ? "warning" : "success"}>
                    {stale ? "Out of date" : "Current"}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Card>

      <Card className="mt-6" id="experience">
        <CardHeader
          title="Experience database"
          description="Section 16 — finished work, ranked against what this tender asks for"
          action={
            <Badge tone="accent">
              Matched to LED street lighting, R29m, municipal
            </Badge>
          }
        />
        <DataTable
          head={
            <>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Project</th>
              <th className="px-5 py-3 text-right font-medium">Value</th>
              <th className="px-5 py-3 font-medium">Completed</th>
              <th className="px-5 py-3 font-medium">Evidence</th>
              <th className="px-5 py-3 text-right font-medium">Relevance</th>
            </>
          }
        >
          {EXPERIENCE.map((project) => (
            <tr key={project.project} className="transition hover:bg-surface-muted">
              <td className="px-5 py-3 font-medium">{project.client}</td>
              <td className="max-w-xs px-5 py-3">
                <span className="block">{project.project}</span>
                <span className="block text-xs text-muted">{project.scope}</span>
              </td>
              <td className="tabular px-5 py-3 text-right">
                {formatCents(project.valueCents)}
              </td>
              <td className="px-5 py-3 text-muted">
                {formatDate(project.completedAt)}
              </td>
              <td className="px-5 py-3">
                <div className="flex flex-wrap gap-1">
                  <Badge tone={project.hasCertificate ? "success" : "neutral"}>
                    {project.hasCertificate ? "Certificate" : "No certificate"}
                  </Badge>
                  <Badge tone={project.hasReference ? "success" : "warning"}>
                    {project.hasReference ? "Reference" : "No reference"}
                  </Badge>
                </div>
              </td>
              <td className="tabular px-5 py-3 text-right font-medium">
                {project.relevance}%
              </td>
            </tr>
          ))}
        </DataTable>
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          Three qualifying projects against a requirement of three at R15m or
          above. Ranking is by service line, value band, client type and
          recency — so the question &ldquo;which of our jobs answers this
          requirement?&rdquo; stops being someone&apos;s memory.
        </p>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ComingSoon title="Suppliers, subcontractors & joint ventures" dependsOn="Procurement">
          Section 17 and 18. Partner compliance, BBBEE status, capacity, pricing
          and signed agreements, attached to the bid that depends on them — the
          30% subcontracting commitment on this tender has no home until it
          exists.
        </ComingSoon>
        <ComingSoon title="Document vault" dependsOn="Vercel Blob credentials">
          Versioned storage for every certificate on this page. The schema and
          version model are already built; direct upload needs blob storage
          credentials, and the same store serves tender documents.
        </ComingSoon>
      </div>
    </>
  );
}
