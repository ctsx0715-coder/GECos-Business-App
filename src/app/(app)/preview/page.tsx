import Link from "next/link";
import { Card, CardHeader, PageHeader, StatTile } from "@/components/ui";
import { PreviewBanner, PreviewNav, StateBadge } from "@/components/ui/preview";
import { PREVIEW_NAV } from "@/lib/preview/nav";
import {
  LIFECYCLE,
  SUPPORTING_LAYERS,
  lifecycleCounts,
} from "@/lib/preview/lifecycle";

/**
 * The lifecycle map.
 *
 * The point of this screen is honesty about coverage. A tendering business
 * runs eighteen stages and eight supporting layers; the platform covers some
 * of them, previews others and has not started the rest. Showing all three
 * states on one page is what makes the preview worth reviewing — a demo that
 * hides the gaps produces no useful correction.
 */

export default function LifecyclePage() {
  const counts = lifecycleCounts();

  return (
    <>
      <PageHeader
        title="Tender lifecycle"
        description="Every stage a South African tendering business actually runs, and how much of it the platform covers today"
      />

      <PreviewNav items={PREVIEW_NAV} current="/preview" />

      <PreviewBanner>
        This map is the plan under review. Stages marked <strong>Live</strong>{" "}
        are working against the database now. <strong>Preview</strong> stages
        are designed here with demonstration data so they can be corrected
        before they are built. <strong>Coming soon</strong> stages wait on a
        module that does not exist yet, and are named rather than guessed at.
      </PreviewBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Live"
          value={String(counts.live)}
          hint="Built and in use"
          tone="success"
        />
        <StatTile
          label="Partly live"
          value={String(counts.partial)}
          hint="Core built, layers missing"
        />
        <StatTile
          label="Preview"
          value={String(counts.preview)}
          hint="Designed, awaiting sign-off"
          tone="warning"
        />
        <StatTile
          label="Coming soon"
          value={String(counts.soon)}
          hint="Blocked on another module"
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="The chain"
          description="Market intelligence through to the performance record that feeds the next bid"
        />
        <ol className="divide-y divide-border">
          {LIFECYCLE.map((stage) => {
            const body = (
              <div className="flex items-start gap-4 px-5 py-4">
                <span className="tabular mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold text-muted">
                  {stage.step}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{stage.name}</h3>
                    <StateBadge state={stage.state} />
                    {stage.dependsOn && (
                      <span className="text-[11px] text-muted">
                        needs {stage.dependsOn}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 max-w-prose text-sm text-muted">
                    {stage.purpose}
                  </p>

                  <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    {stage.built && (
                      <div className="flex gap-2">
                        <dt className="shrink-0 font-medium text-success">
                          Have
                        </dt>
                        <dd className="text-muted">{stage.built}</dd>
                      </div>
                    )}
                    {stage.missing && (
                      <div className="flex gap-2">
                        <dt className="shrink-0 font-medium text-warning">
                          Need
                        </dt>
                        <dd className="text-muted">{stage.missing}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {stage.href && (
                  <span className="shrink-0 self-center text-xs text-accent">
                    Open →
                  </span>
                )}
              </div>
            );

            return (
              <li key={stage.key}>
                {stage.href ? (
                  <Link
                    href={stage.href}
                    className="block transition hover:bg-surface-muted"
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Supporting layers"
          description="Things a tender touches at every stage rather than at one point"
        />
        <ul className="divide-y divide-border">
          {SUPPORTING_LAYERS.map((layer) => {
            const body = (
              <div className="flex items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{layer.name}</h3>
                    <StateBadge state={layer.state} />
                    <span className="text-[11px] text-muted">
                      {layer.purpose}
                    </span>
                  </div>
                  <p className="mt-1 max-w-prose text-sm text-muted">
                    {layer.detail}
                  </p>
                </div>
                {layer.dependsOn && (
                  <span className="shrink-0 self-center text-[11px] text-muted">
                    needs {layer.dependsOn}
                  </span>
                )}
              </div>
            );

            return (
              <li key={layer.key}>
                {layer.href ? (
                  <Link
                    href={layer.href}
                    className="block transition hover:bg-surface-muted"
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="The principle underneath"
          description="Why this is arranged as a chain and not as a list of modules"
        />
        <div className="px-5 py-4">
          <p className="max-w-prose text-sm text-muted">
            A tender is not an isolated record with a closing date. It is the
            point where the whole business meets one opportunity, and each link
            feeds the next one:
          </p>
          <p className="mt-3 rounded-lg bg-surface-muted px-4 py-3 text-xs leading-relaxed text-muted">
            Tender → Client → Requirements → Compliance → People → Experience →
            Suppliers → Pricing → Proposal → Approval → Submission → Award →
            Contract → Project → Finance → Performance → <strong>the next tender</strong>
          </p>
          <p className="mt-3 max-w-prose text-sm text-muted">
            Which is why the win-rate reporting is not a bolt-on at the end. The
            performance record from a finished job is the evidence the next
            submission is scored on, and the reason to keep the chain in one
            system rather than five.
          </p>
        </div>
      </Card>
    </>
  );
}
