import Link from "next/link";
import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { hrService } from "@/modules/hr/hr.service";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { RunAccrual } from "./run-accrual";

/**
 * Leave policy, as rows.
 *
 * The BCEA is a floor, and whichever bargaining council or company policy sits
 * above it differs by employer — so the rules live in this table rather than in
 * the code, and changing one is an edit rather than a deployment
 * (docs/02-discovery-questions.md).
 */

const ACCRUAL_LABELS: Record<string, string> = {
  MANUAL: "Set by hand",
  ANNUAL_GRANT: "Granted at the start of the cycle",
  MONTHLY_ACCRUAL: "Accrues monthly",
};

export default async function LeaveTypesPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("hr.leave.configure")) return null;
    return { types: await hrService.listLeaveTypes(true) };
  });

  /*
   * The dashboard, not the leave register. Someone who cannot configure leave
   * usually cannot see everyone's leave either, so bouncing them one step
   * sideways produces a second refusal instead of a graceful exit.
   */
  if (!data) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Leave types"
        description="What each kind of leave is worth, and how it is credited"
        action={
          <span className="flex items-center gap-2">
            <RunAccrual />
            <ButtonLink href="/hr/leave/types/new" variant="primary" icon="plus">
              New type
            </ButtonLink>
          </span>
        }
      />

      <Card>
        <CardHeader
          icon="calendar"
          title="Policy"
          description="Accrual runs on the first of every month, and can be run by hand at any time"
        />
        {data.types.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No leave types yet"
            description="Annual, sick and family responsibility leave are the statutory minimum. Add them before anyone books time off."
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.types.map((type) => (
              <li key={type.id} className="flex items-center gap-4 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/hr/leave/types/${type.id}`}
                    className="block text-sm font-medium underline decoration-border underline-offset-4"
                  >
                    {type.name}
                  </Link>
                  <span className="block text-xs text-faint">
                    <span className="tabular">{type.code}</span>
                    {" · "}
                    {ACCRUAL_LABELS[type.accrualMethod]}
                    {type.accrualMethod === "MONTHLY_ACCRUAL" &&
                      ` at ${Number(type.accrualDaysPerPeriod)} days a month`}
                    {type.documentRequiredAfterDays !== null &&
                      ` · note after ${type.documentRequiredAfterDays} days`}
                  </span>
                </span>

                {!type.isPaid && <Badge tone="neutral">Unpaid</Badge>}
                {!type.isActive && (
                  <Badge tone="neutral" icon="ban">
                    Retired
                  </Badge>
                )}

                <span className="tabular w-24 text-right text-sm">
                  {type.daysPerCycle === null ? (
                    <span className="text-muted">Uncapped</span>
                  ) : (
                    <>
                      {Number(type.daysPerCycle)}
                      <span className="ml-1 text-xs text-muted">days</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
