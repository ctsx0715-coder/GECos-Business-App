import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
} from "@/components/ui";
import {
  ComingSoon,
  DataTable,
  Meter,
  PreviewBanner,
  PreviewNav,
  ScoreRing,
} from "@/components/ui/preview";
import { PREVIEW_NAV } from "@/lib/preview/nav";
import {
  BID_SCORECARD,
  DEMO_TENDER,
  ELIGIBILITY,
  RISK_REGISTER,
  SCORE_BANDS,
  scoreBand,
  scorecardTotal,
} from "@/lib/preview/demo-data";
import { formatCents, formatDate } from "@/lib/format";

/**
 * Sections 7, 8 and 9 — should we pursue this?
 *
 * Three questions in order, and the order matters. Eligibility is a gate: fail
 * a mandatory requirement and the score is irrelevant. The scorecard is a
 * judgement, weighted and recorded so it can be reviewed after the outcome is
 * known. The risk register is what the score does not capture — a bid can be
 * worth winning and still be worth declining.
 */

const RESULT_TONES = {
  pass: "success",
  review: "warning",
  fail: "danger",
} as const;

const LEVEL_TONES = {
  Low: "success",
  Medium: "warning",
  High: "danger",
} as const;

export default function QualificationPage() {
  const total = scorecardTotal();
  const band = scoreBand(total);
  const fails = ELIGIBILITY.filter((c) => c.result === "fail");
  const reviews = ELIGIBILITY.filter((c) => c.result === "review");

  const ringTone =
    band.tone === "success" ? "success" : band.tone === "warning" ? "warning" : "danger";

  return (
    <>
      <PageHeader
        title="Qualification & bid decision"
        description={`${DEMO_TENDER.reference} · ${DEMO_TENDER.title}`}
        action={<Badge tone="accent">Closing {formatDate(DEMO_TENDER.closingAt)}</Badge>}
      />

      <PreviewNav items={PREVIEW_NAV} current="/preview/qualification" />

      <PreviewBanner>
        The screening rules, the weights and the thresholds below are the things
        to correct. They are demonstration values — the real ones differ per
        service line, and getting them from the business is the point of showing
        this early.
      </PreviewBanner>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Eligibility screening"
            description="Section 7 — can we legally and practically bid at all?"
            action={
              <Badge tone={fails.length > 0 ? "danger" : reviews.length > 0 ? "warning" : "success"}>
                {fails.length > 0
                  ? `${fails.length} failing`
                  : reviews.length > 0
                    ? `${reviews.length} to resolve`
                    : "All clear"}
              </Badge>
            }
          />
          <DataTable
            head={
              <>
                <th className="px-5 py-3 font-medium">Requirement</th>
                <th className="px-5 py-3 font-medium">Tender asks for</th>
                <th className="px-5 py-3 font-medium">We have</th>
                <th className="px-5 py-3 font-medium">Result</th>
              </>
            }
          >
            {ELIGIBILITY.map((check) => (
              <tr key={check.requirement} className="transition hover:bg-surface-muted">
                <td className="px-5 py-3 font-medium">{check.requirement}</td>
                <td className="px-5 py-3 text-muted">{check.required}</td>
                <td className="px-5 py-3 text-muted">{check.weHave}</td>
                <td className="px-5 py-3">
                  <Badge tone={RESULT_TONES[check.result]}>
                    {check.result === "pass"
                      ? "Pass"
                      : check.result === "review"
                        ? "Resolve"
                        : "Fail"}
                  </Badge>
                </td>
              </tr>
            ))}
          </DataTable>
          <p className="border-t border-border px-5 py-3 text-xs text-muted">
            A failing mandatory requirement is a gate, not a deduction. ISO 45001
            is not held — on this tender it is scored rather than mandatory, so
            the bid survives it and loses functionality points. Had it been
            mandatory, the correct answer would be no bid, whatever the
            scorecard said.
          </p>
        </Card>

        <div className="space-y-6">
          <Card id="scorecard">
            <CardHeader
              title="Bid / no-bid"
              description="Section 8 — weighted, recorded, reviewable"
            />
            <div className="flex flex-col items-center px-5 py-5">
              <ScoreRing value={total} caption="of 100" tone={ringTone} />
              <Badge tone={band.tone}>{band.label}</Badge>
              <p className="mt-2 text-center text-xs text-muted">{band.note}</p>
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {SCORE_BANDS.map((b) => (
                <li
                  key={b.label}
                  className={`flex items-center justify-between gap-3 px-5 py-2 text-xs ${
                    b.label === band.label ? "bg-surface-muted" : ""
                  }`}
                >
                  <span className="text-muted">{b.label}</span>
                  <span className="tabular font-medium">
                    {b.min === 0 ? "below 50" : `${b.min}+`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="At stake" />
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Estimated value</dt>
                <dd className="tabular font-medium">
                  {formatCents(DEMO_TENDER.estimatedValueCents)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Contract period</dt>
                <dd className="tabular font-medium">
                  {DEMO_TENDER.durationMonths} months
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Cost to bid</dt>
                <dd className="tabular font-medium">≈ 62 hours</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Bidders at briefing</dt>
                <dd className="tabular font-medium">9</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Scorecard"
          description="Weights sum to 100. Each criterion is scored out of 10 with the reason recorded."
        />
        <div className="divide-y divide-border">
          {BID_SCORECARD.map((row) => {
            const contribution = (row.score / 10) * row.weight;
            const tone =
              row.score >= 8 ? "success" : row.score >= 6 ? "accent" : "warning";
            return (
              <div key={row.criterion} className="flex items-center gap-4 px-5 py-3">
                <div className="w-44 shrink-0">
                  <p className="text-sm font-medium">{row.criterion}</p>
                  <p className="text-xs text-muted">weight {row.weight}%</p>
                </div>
                <div className="min-w-0 flex-1">
                  <Meter value={row.score} max={10} tone={tone} />
                  <p className="mt-1 text-xs text-muted">{row.note}</p>
                </div>
                <div className="w-20 shrink-0 text-right">
                  <p className="tabular text-sm font-semibold">
                    {contribution.toFixed(1)}
                  </p>
                  <p className="text-[11px] text-muted">of {row.weight}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-sm font-medium">Opportunity score</span>
          <span className="tabular text-lg font-semibold">{total} / 100</span>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Risk assessment"
          description="Section 9 — commercial, operational, legal, compliance and strategic risk before we commit resources"
        />
        <DataTable
          head={
            <>
              <th className="px-5 py-3 font-medium">Class</th>
              <th className="px-5 py-3 font-medium">Risk</th>
              <th className="px-5 py-3 font-medium">Likelihood</th>
              <th className="px-5 py-3 font-medium">Impact</th>
              <th className="px-5 py-3 font-medium">Mitigation</th>
            </>
          }
        >
          {RISK_REGISTER.map((risk) => (
            <tr key={risk.risk} className="transition hover:bg-surface-muted">
              <td className="px-5 py-3">
                <Badge tone="neutral">{risk.category}</Badge>
              </td>
              <td className="max-w-sm px-5 py-3">{risk.risk}</td>
              <td className="px-5 py-3">
                <Badge tone={LEVEL_TONES[risk.likelihood]}>{risk.likelihood}</Badge>
              </td>
              <td className="px-5 py-3">
                <Badge tone={LEVEL_TONES[risk.impact]}>{risk.impact}</Badge>
              </td>
              <td className="max-w-sm px-5 py-3 text-xs text-muted">
                {risk.mitigation}
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ComingSoon title="AI bid / no-bid recommendation" dependsOn="AI layer">
          Section 44. The tender&apos;s stated requirements compared line by line
          against the company file — required experience against projects held,
          required grading against grading held, required BBBEE against our
          level — producing a recommendation with its reasoning, for a human to
          accept or overrule.
        </ComingSoon>
        <ComingSoon title="Decision record & approval" dependsOn="This module being built">
          The decision, its score, who took it and why, stored against the
          tender. Without it the scorecard is a calculator; with it, this
          quarter&apos;s no-bids can be reviewed against what those tenders
          eventually went for.
        </ComingSoon>
      </div>
    </>
  );
}
