import {
  Badge,
  Card,
  CardHeader,
  Field,
  PageHeader,
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
  DEMO_TENDER,
  EVALUATION,
  POST_SUBMISSION,
  SUBMISSION_GATE,
  SUBMISSION_RECORD,
} from "@/lib/preview/demo-data";
import { formatDate } from "@/lib/format";

/**
 * Sections 24 to 28 — getting it in, and what happens afterwards.
 *
 * The approval workflow that guards this is live, including separation of
 * duties and the audit trail. Three things are previewed: the readiness gate
 * that runs before approval, proof of submission, and the evaluation tracking
 * that runs for weeks after the bid has left the building — which is where most
 * tender registers stop, and where most of the useful intelligence is.
 */

const OUTCOME_ORDER = ["passed", "in_progress", "pending"] as const;

export default function SubmissionPage() {
  const passed = SUBMISSION_GATE.filter((c) => c.passed);
  const ready = passed.length === SUBMISSION_GATE.length;
  const percent = Math.round((passed.length / SUBMISSION_GATE.length) * 100);
  const evaluationScore = EVALUATION.reduce(
    (sum, stage) => sum + (stage.ourScore ?? 0),
    0,
  );
  const evaluationMax = EVALUATION.reduce(
    (sum, stage) => sum + (stage.weight ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Submission & evaluation"
        description={`${DEMO_TENDER.reference} · ${DEMO_TENDER.buyer}`}
        action={
          <Badge tone={ready ? "success" : "danger"}>
            {ready ? "Ready to submit" : "Not ready"}
          </Badge>
        }
      />

      <PreviewNav items={PREVIEW_NAV} current="/preview/submission" />

      <PreviewBanner>
        The approval chain behind this is live and enforced server-side — a
        tender officer cannot approve their own bid. Previewed here: the
        readiness gate that runs before approval, the proof-of-submission record,
        and evaluation tracking after the bid leaves.
      </PreviewBanner>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Submission readiness gate"
            description="Section 24 — everything true, or it does not go"
            action={
              <div className="w-32">
                <Meter
                  value={percent}
                  tone={ready ? "success" : "danger"}
                  caption={`${passed.length}/${SUBMISSION_GATE.length}`}
                />
              </div>
            }
          />
          <ul className="divide-y divide-border">
            {SUBMISSION_GATE.map((check) => (
              <li key={check.check} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    check.passed
                      ? "bg-success-soft text-success"
                      : "bg-danger-soft text-danger"
                  }`}
                >
                  {check.passed ? "✓" : "!"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{check.check}</p>
                  <p className="text-xs text-muted">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <p
            className={`border-t border-border px-5 py-3 text-xs ${
              ready ? "text-success" : "text-danger"
            }`}
          >
            {ready
              ? "All checks pass. The submit action is available."
              : "Three checks are open. The gate is a server-side rule, not a hidden button — a hand-typed URL is refused the same way."}
          </p>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Proof of submission"
              description="Section 25 — what you produce when a buyer says they never received it"
            />
            <dl className="grid gap-4 px-5 py-4">
              <Field label="Method">{SUBMISSION_RECORD.method}</Field>
              <Field label="Delivered to">{SUBMISSION_RECORD.address}</Field>
              <Field label="Submitted">
                {formatDate(SUBMISSION_RECORD.submittedAt)} by{" "}
                {SUBMISSION_RECORD.submittedBy}
              </Field>
              <Field label="Receipt reference">
                <span className="tabular">{SUBMISSION_RECORD.receiptReference}</span>
              </Field>
              <Field label="Acknowledged">
                <Badge tone={SUBMISSION_RECORD.acknowledged ? "success" : "warning"}>
                  {SUBMISSION_RECORD.acknowledged ? "Stamped receipt on file" : "Awaiting"}
                </Badge>
              </Field>
            </dl>
          </Card>

          <Card id="evaluation">
            <CardHeader
              title="Evaluation"
              description="Section 27 — where the bid sits in the buyer's process"
              action={
                <span className="tabular text-sm font-semibold">
                  {evaluationScore}/{evaluationMax}
                </span>
              }
            />
            <ol className="divide-y divide-border">
              {[...EVALUATION]
                .sort(
                  (a, b) =>
                    OUTCOME_ORDER.indexOf(a.status) - OUTCOME_ORDER.indexOf(b.status),
                )
                .map((stage) => (
                  <li key={stage.stage} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{stage.stage}</span>
                      <Badge
                        tone={
                          stage.status === "passed"
                            ? "success"
                            : stage.status === "in_progress"
                              ? "accent"
                              : "neutral"
                        }
                      >
                        {stage.status === "in_progress"
                          ? "In progress"
                          : stage.status === "passed"
                            ? "Passed"
                            : "Pending"}
                      </Badge>
                    </div>
                    {stage.weight !== undefined && (
                      <div className="mt-2">
                        <Meter
                          value={stage.ourScore ?? 0}
                          max={stage.weight}
                          tone={
                            stage.threshold !== undefined &&
                            (stage.ourScore ?? 0) < stage.threshold
                              ? "danger"
                              : "accent"
                          }
                          caption={`${stage.ourScore ?? 0} of ${stage.weight}`}
                        />
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted">{stage.note}</p>
                  </li>
                ))}
            </ol>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Post-submission"
          description="Section 26 — clarifications, addenda, presentations and due diligence"
        />
        <DataTable
          head={
            <>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Detail</th>
              <th className="px-5 py-3 font-medium">Our response</th>
            </>
          }
        >
          {POST_SUBMISSION.map((event, index) => (
            <tr key={index} className="transition hover:bg-surface-muted">
              <td className="px-5 py-3 text-muted">{formatDate(event.at)}</td>
              <td className="px-5 py-3">
                <Badge tone={event.kind === "Addendum" ? "warning" : "accent"}>
                  {event.kind}
                </Badge>
              </td>
              <td className="max-w-lg px-5 py-3">{event.summary}</td>
              <td className="px-5 py-3">
                <Badge tone={event.responded ? "success" : "danger"}>
                  {event.responded ? "Responded" : "Outstanding"}
                </Badge>
              </td>
            </tr>
          ))}
        </DataTable>
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          A tender is not finished when it is submitted. Addendum 2 moved the
          closing date by a week; had it not been recorded against the bid, the
          checklist deadlines would still be pointing at the old one.
        </p>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ComingSoon title="Correspondence log" dependsOn="Documents + Communications">
          Section 43. Emails, calls, meetings and client correspondence linked to
          tender, client, person and activity — so the answer to &ldquo;what did
          we tell them about the pole certification?&rdquo; is in the system
          rather than in someone&apos;s mailbox.
        </ComingSoon>
        <ComingSoon title="Award to contract" dependsOn="Finance / Legal">
          Sections 29 and 30. Award letter, contract value, KPIs, SLA, penalties,
          retention and guarantees, then mobilisation. Recording the outcome and
          starting a project from a won tender are already live — what is missing
          is the contract in between.
        </ComingSoon>
      </div>
    </>
  );
}
