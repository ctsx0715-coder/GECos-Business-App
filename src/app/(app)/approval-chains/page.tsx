import { redirect } from "next/navigation";
import { withSession } from "@/lib/auth/session";
import { workflowService } from "@/modules/workflows/workflow.service";
import { Badge, Card, CardHeader, EmptyState, Icon, PageHeader } from "@/components/ui";
import { AddStep, ChainSwitch, NewChain, StepControls } from "./manage";

/**
 * Who approves what, and in what order.
 *
 * The engine that runs these has enforced them since the tender module
 * (ADR-006). What did not exist was any way to write one down without a
 * deployment, which meant the answer to "not everybody can approve this" was
 * whatever the seed happened to say.
 *
 * A chain reads top to bottom: each step waits for the one above it, and a
 * step with a condition only appears when the record meets it — which is how
 * "anything over five million also needs the Managing Director" is expressed
 * without a second chain.
 */

const ENTITY_LABELS: Record<string, string> = {
  TENDER: "Tenders",
  EXPENSE: "Project expenses",
  PROJECT: "Projects",
};

const APPROVER_LABELS: Record<string, string> = {
  ROLE: "Whoever holds the role",
  MANAGER: "The requester's manager",
  USER: "One named person",
};

const OPERATOR_LABELS: Record<string, string> = {
  EQ: "is",
  NEQ: "is not",
  GT: "is over",
  GTE: "is at least",
  LT: "is under",
  LTE: "is at most",
};

export default async function ApprovalChainsPage() {
  const data = await withSession(async (session) => {
    if (!session.permissions.has("core.workflow.view")) return null;
    return {
      chains: await workflowService.listChains(),
      options: await workflowService.approverOptions(),
      mayManage: session.permissions.has("core.workflow.manage"),
    };
  });

  if (!data) redirect("/dashboard");

  const roles = data.options.roles.map((role) => ({
    value: role.id,
    label: role.name,
  }));
  const users = data.options.users.map((user) => ({
    value: user.id,
    label: `${user.firstName} ${user.lastName}${user.jobTitle ? ` — ${user.jobTitle}` : ""}`,
  }));

  return (
    <>
      <PageHeader
        title="Approval chains"
        description="Who signs off what, in which order, and when a bigger number needs a bigger signature"
        action={data.mayManage ? <NewChain /> : undefined}
      />

      {data.chains.length === 0 ? (
        <Card>
          <CardHeader icon="inbox" title="No chains yet" />
          <EmptyState
            icon="inbox"
            title="Nothing needs approval"
            description="Until a chain exists, whoever holds the permission can approve on their own. A chain is how that becomes a hierarchy."
          />
        </Card>
      ) : (
        data.chains.map((chain) => (
          <Card key={chain.id} className="mb-4">
            <CardHeader
              icon="inbox"
              title={chain.name}
              description={`${ENTITY_LABELS[chain.entityType] ?? chain.entityType} · runs on ${chain.triggerEvent} · ${chain._count.instances} started`}
              action={
                data.mayManage ? (
                  <ChainSwitch chainId={chain.id} isActive={chain.isActive} />
                ) : (
                  <Badge tone={chain.isActive ? "success" : "neutral"}>
                    {chain.isActive ? "Active" : "Off"}
                  </Badge>
                )
              }
            />

            {chain.steps.length === 0 ? (
              <EmptyState
                icon="alert"
                title="No steps"
                description="A chain with no steps approves nothing — the record passes straight through. Add the first approver."
              />
            ) : (
              <ol className="divide-y divide-border">
                {chain.steps.map((step, index) => (
                  <li key={step.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="tabular grid size-7 shrink-0 place-items-center rounded-full border border-border text-xs font-medium text-muted">
                      {index + 1}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{step.name}</span>
                      <span className="block text-xs text-faint">
                        {APPROVER_LABELS[step.approverType]}
                        {step.approverRole && `: ${step.approverRole.name}`}
                        {step.approverUser &&
                          `: ${step.approverUser.firstName} ${step.approverUser.lastName}`}
                        {step.slaHours && ` · ${step.slaHours}h to respond`}
                      </span>
                      {step.conditionField && (
                        <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                          <Icon name="filter" size={12} />
                          Only when{" "}
                          <span className="tabular">{step.conditionField}</span>{" "}
                          {OPERATOR_LABELS[step.conditionOperator ?? "EQ"]}{" "}
                          <span className="tabular">{step.conditionValue}</span>
                        </span>
                      )}
                    </span>

                    {data.mayManage && (
                      <StepControls
                        stepId={step.id}
                        isFirst={index === 0}
                        isLast={index === chain.steps.length - 1}
                      />
                    )}
                  </li>
                ))}
              </ol>
            )}

            {data.mayManage && (
              <AddStep chainId={chain.id} roles={roles} users={users} />
            )}
          </Card>
        ))
      )}
    </>
  );
}
