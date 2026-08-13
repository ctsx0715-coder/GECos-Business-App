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
  Meter,
  PreviewBanner,
  PreviewNav,
} from "@/components/ui/preview";
import { PREVIEW_NAV } from "@/lib/preview/nav";
import {
  BID_TEAM,
  COMPLIANCE_MATRIX,
  DEMO_TENDER,
  EXTRACTED_REQUIREMENTS,
} from "@/lib/preview/demo-data";
import { formatCents, formatDate, formatRelativeDays } from "@/lib/format";

/**
 * Sections 10 to 14 — the tender as a workspace rather than a row.
 *
 * The register already carries a requirement checklist that blocks submission
 * while a mandatory line is open. What is missing is everything around it: the
 * requirements pulled out of the document in the first place, an owner and a
 * deadline against each one, and a single view of whether this bid can be
 * submitted at all.
 *
 * The compliance matrix is the centre of this screen because it answers the
 * only question management asks about a live bid: are we going to make it?
 */

const STATUS_META = {
  complete: { label: "Complete", tone: "success" as const },
  in_progress: { label: "In progress", tone: "accent" as const },
  blocked: { label: "Blocked", tone: "danger" as const },
  not_started: { label: "Not started", tone: "neutral" as const },
};

const KIND_TONES = {
  Mandatory: "danger",
  Technical: "accent",
  Commercial: "warning",
  Evaluation: "neutral",
} as const;

export default function BidWorkspacePage() {
  const mandatory = COMPLIANCE_MATRIX.filter((row) => row.mandatory);
  const mandatoryDone = mandatory.filter((row) => row.status === "complete");
  const blocked = COMPLIANCE_MATRIX.filter((row) => row.status === "blocked");
  const readiness = Math.round(
    (COMPLIANCE_MATRIX.filter((r) => r.status === "complete").length /
      COMPLIANCE_MATRIX.length) *
      100,
  );
  const closing = formatRelativeDays(DEMO_TENDER.closingAt);

  return (
    <>
      <PageHeader
        title="Bid workspace"
        description={`${DEMO_TENDER.reference} · ${DEMO_TENDER.buyer}`}
        action={
          <Badge tone={closing.days <= 7 ? "danger" : "warning"}>
            Closes {closing.label}
          </Badge>
        }
      />

      <PreviewNav items={PREVIEW_NAV} current="/preview/bid-workspace" />

      <PreviewBanner>
        The checklist underneath this is live — a tender in the register cannot
        be submitted while a mandatory line is open. Previewed here: the
        requirements extracted from the tender document, ownership and deadlines
        per line, and the bid team.
      </PreviewBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Submission readiness"
          value={`${readiness}%`}
          hint={`${mandatoryDone.length} of ${mandatory.length} mandatory complete`}
          tone={readiness >= 90 ? "success" : "warning"}
        />
        <StatTile
          label="Blocked"
          value={String(blocked.length)}
          hint="Cannot proceed without action"
          tone={blocked.length > 0 ? "danger" : "success"}
        />
        <StatTile
          label="Days to closing"
          value={String(Math.max(0, closing.days))}
          hint={formatDate(DEMO_TENDER.closingAt)}
          tone={closing.days <= 7 ? "danger" : "default"}
        />
        <StatTile
          label="Addenda issued"
          value={String(DEMO_TENDER.addenda)}
          hint="Both acknowledged"
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Tender at a glance"
          description="Section 5 — captured once, from the document"
        />
        <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Buyer">{DEMO_TENDER.buyer}</Field>
          <Field label="Department">{DEMO_TENDER.department}</Field>
          <Field label="Client reference">{DEMO_TENDER.tenderNumber}</Field>
          <Field label="Type">{DEMO_TENDER.type}</Field>
          <Field label="Category">{DEMO_TENDER.category}</Field>
          <Field label="Location">
            {DEMO_TENDER.location}, {DEMO_TENDER.province}
          </Field>
          <Field label="Contract period">{DEMO_TENDER.durationMonths} months</Field>
          <Field label="Estimated value">
            <span className="tabular">
              {formatCents(DEMO_TENDER.estimatedValueCents)}
            </span>
          </Field>
          <Field label="Published">{formatDate(DEMO_TENDER.publishedAt)}</Field>
          <Field label="Briefing">
            {formatDate(DEMO_TENDER.briefingAt)}
            <Badge tone={DEMO_TENDER.briefingAttended ? "success" : "danger"}>
              {DEMO_TENDER.briefingCompulsory ? "Compulsory" : "Optional"}
            </Badge>
          </Field>
          <Field label="Submission">{DEMO_TENDER.submissionMethod}</Field>
          <Field label="Buyer contact">
            {DEMO_TENDER.contactName} · {DEMO_TENDER.contactEmail}
          </Field>
        </dl>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Compliance matrix"
          description="Section 12 — every requirement, its owner, its evidence and its state"
          action={
            <div className="w-40">
              <Meter
                value={readiness}
                tone={readiness >= 90 ? "success" : "warning"}
                caption={`${readiness}%`}
              />
            </div>
          }
        />
        <DataTable
          head={
            <>
              <th className="px-5 py-3 font-medium">Requirement</th>
              <th className="px-5 py-3 font-medium">Mandatory</th>
              <th className="px-5 py-3 font-medium">Owner</th>
              <th className="px-5 py-3 font-medium">Evidence</th>
              <th className="px-5 py-3 font-medium">Due</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </>
          }
        >
          {COMPLIANCE_MATRIX.map((row) => {
            const meta = STATUS_META[row.status];
            return (
              <tr key={row.requirement} className="transition hover:bg-surface-muted">
                <td className="px-5 py-3 font-medium">{row.requirement}</td>
                <td className="px-5 py-3">
                  {row.mandatory ? (
                    <Badge tone="danger">Yes</Badge>
                  ) : (
                    <span className="text-xs text-muted">No</span>
                  )}
                </td>
                <td className="px-5 py-3 text-muted">{row.owner}</td>
                <td className="px-5 py-3 text-muted">{row.evidence}</td>
                <td className="px-5 py-3 text-muted">{formatDate(row.dueAt)}</td>
                <td className="px-5 py-3">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </td>
              </tr>
            );
          })}
        </DataTable>
        {blocked.length > 0 && (
          <p className="border-t border-border bg-danger-soft px-5 py-3 text-xs text-danger">
            <strong className="font-semibold">Blocked:</strong>{" "}
            {blocked.map((row) => row.requirement).join(", ")}. Mandatory and
            outstanding — this bid cannot be submitted until it is resolved, and
            the submit action is refused server-side rather than merely hidden.
          </p>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Requirements extracted from the document"
            description="Section 11 — the tender pack turned into an actionable list"
          />
          <DataTable
            head={
              <>
                <th className="px-5 py-3 font-medium">Clause</th>
                <th className="px-5 py-3 font-medium">Requirement</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Source</th>
              </>
            }
          >
            {EXTRACTED_REQUIREMENTS.map((req) => (
              <tr key={req.clause} className="transition hover:bg-surface-muted">
                <td className="tabular px-5 py-3 font-medium">{req.clause}</td>
                <td className="max-w-sm px-5 py-3">{req.requirement}</td>
                <td className="px-5 py-3">
                  <Badge tone={KIND_TONES[req.kind]}>{req.kind}</Badge>
                </td>
                <td className="px-5 py-3 text-xs text-muted">{req.source}</td>
              </tr>
            ))}
          </DataTable>
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            Every line traces back to a clause. When a buyer issues an addendum,
            the changed clause is what tells you which checklist lines and which
            owners are affected.
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Bid team"
            description="Section 13 — every requirement has an owner"
          />
          <ul className="divide-y divide-border">
            {BID_TEAM.map((member) => (
              <li
                key={member.role}
                className="flex items-start justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{member.person}</p>
                  <p className="text-xs text-muted">{member.role}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {member.responsibility}
                  </p>
                </div>
                <Badge tone={member.openItems > 0 ? "warning" : "success"}>
                  {member.openItems > 0 ? `${member.openItems} open` : "Clear"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ComingSoon title="Tender document workspace" dependsOn="Vercel Blob credentials">
          Section 10. Invitation, specification, scope, BOQ, drawings, contract,
          annexures and addenda, each versioned with a source, an owner and a
          required action. The schema and versioning exist; direct upload needs
          storage credentials.
        </ComingSoon>
        <ComingSoon title="AI compliance check" dependsOn="AI layer">
          Section 45. &ldquo;What are we missing?&rdquo; — the tender&apos;s
          mandatory list checked against the document repository, returning what
          is complete, what has expired and what is absent, with a submission
          risk rating.
        </ComingSoon>
      </div>
    </>
  );
}
