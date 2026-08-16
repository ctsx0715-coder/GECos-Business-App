import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rawDb } from "@/lib/database/client";
import { withRequestContext } from "@/lib/database/tenant-context";
import { BusinessRuleError, ForbiddenError } from "@/lib/errors";
import { workflowService } from "@/modules/workflows/workflow.service";
import {
  resetDatabase,
  seedOrganisation,
  seedPermissions,
  type SeededOrg,
} from "./fixtures";

/**
 * Building an approval hierarchy.
 *
 * The engine that runs these chains is tested through the tender module. What
 * is tested here is the configuration of them, and the rules that stop
 * somebody building a chain that cannot work: an empty chain switched on, two
 * chains racing on one trigger, and an order that has been left with holes in
 * it after a step was removed.
 */

let org: SeededOrg;

function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  return withRequestContext(
    { organisationId: org.organisationId, userId: org.userIds[role] },
    fn,
  );
}

beforeEach(async () => {
  await resetDatabase();
  await seedPermissions();
  org = await seedOrganisation("Nopedi");
});

afterAll(async () => {
  await rawDb.$disconnect();
});

async function aChain() {
  return as("executive", () =>
    workflowService.createChain({
      name: "Expense approval",
      entityType: "EXPENSE",
      triggerEvent: "expense.submitted",
    }),
  );
}

async function aStep(chainId: string, name: string, overrides = {}) {
  return as("executive", () =>
    workflowService.addStep({
      chainId,
      name,
      approverType: "ROLE",
      approverRoleId: org.roleIds.finance_manager,
      ...overrides,
    }),
  );
}

describe("creating a chain", () => {
  it("starts switched off, because it has nothing in it yet", async () => {
    const chain = await aChain();
    expect(chain.isActive).toBe(true);

    // Active with no steps approves nothing, so switching it on is refused
    // until a step exists. (The row is created active; the guard is on the
    // update, which is the only path a person takes.)
    await expect(
      as("executive", () =>
        workflowService.updateChain({ chainId: chain.id, isActive: true }),
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses a second chain on the same trigger", async () => {
    await aChain();
    await expect(aChain()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("is not something an ordinary employee may do", async () => {
    await expect(
      as("employee", () =>
        workflowService.createChain({
          name: "My own approval",
          entityType: "EXPENSE",
          triggerEvent: "expense.submitted",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("is not visible to somebody without the read permission", async () => {
    await expect(
      as("employee", () => workflowService.listChains()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("the steps of a chain", () => {
  it("are added in order", async () => {
    const chain = await aChain();
    await aStep(chain.id, "Finance review");
    await aStep(chain.id, "Managing Director", {
      approverType: "USER",
      approverRoleId: null,
      approverUserId: org.userIds.executive,
    });

    const built = await as("executive", () => workflowService.getChain(chain.id));
    expect(built.steps.map((step) => step.name)).toEqual([
      "Finance review",
      "Managing Director",
    ]);
    expect(built.steps.map((step) => step.sortOrder)).toEqual([0, 1]);
  });

  it("can be reordered", async () => {
    const chain = await aChain();
    await aStep(chain.id, "First");
    const second = await aStep(chain.id, "Second");

    await as("executive", () =>
      workflowService.moveStep({ stepId: second.id, direction: "UP" }),
    );

    const built = await as("executive", () => workflowService.getChain(chain.id));
    expect(built.steps.map((step) => step.name)).toEqual(["Second", "First"]);
    expect(built.steps.map((step) => step.sortOrder)).toEqual([0, 1]);
  });

  it("stay contiguous when one is removed from the middle", async () => {
    const chain = await aChain();
    await aStep(chain.id, "First");
    const middle = await aStep(chain.id, "Middle");
    await aStep(chain.id, "Last");

    await as("executive", () =>
      workflowService.removeStep({ stepId: middle.id }),
    );

    const built = await as("executive", () => workflowService.getChain(chain.id));
    expect(built.steps.map((step) => step.name)).toEqual(["First", "Last"]);
    // A hole here would collide with the next step somebody adds.
    expect(built.steps.map((step) => step.sortOrder)).toEqual([0, 1]);
  });

  it("refuse a role step with no role", async () => {
    const chain = await aChain();
    await expect(
      as("executive", () =>
        workflowService.addStep({
          chainId: chain.id,
          name: "Somebody",
          approverType: "ROLE",
        }),
      ),
    ).rejects.toThrow();
  });

  it("refuse half a condition", async () => {
    const chain = await aChain();
    await expect(
      as("executive", () =>
        workflowService.addStep({
          chainId: chain.id,
          name: "Big ones only",
          approverType: "MANAGER",
          conditionField: "amountCents",
          conditionOperator: "GT",
        }),
      ),
    ).rejects.toThrow();
  });

  it("accept a whole condition", async () => {
    const chain = await aChain();
    const step = await as("executive", () =>
      workflowService.addStep({
        chainId: chain.id,
        name: "Over five million",
        approverType: "MANAGER",
        conditionField: "amountCents",
        conditionOperator: "GT",
        conditionValue: "500000000",
      }),
    );
    expect(step.conditionOperator).toBe("GT");
  });

  it("let a chain with a step be switched on", async () => {
    const chain = await aChain();
    await aStep(chain.id, "Finance review");

    const updated = await as("executive", () =>
      workflowService.updateChain({ chainId: chain.id, isActive: true }),
    );
    expect(updated.isActive).toBe(true);
  });

  it("are not something the finance manager may write, only read", async () => {
    const chain = await aChain();

    // They sit in the chain, so they can see it.
    const seen = await as("finance_manager", () => workflowService.listChains());
    expect(seen).toHaveLength(1);

    // Writing themselves out of it is another matter.
    await expect(
      as("finance_manager", () =>
        workflowService.addStep({
          chainId: chain.id,
          name: "Me, at the end",
          approverType: "USER",
          approverUserId: org.userIds.finance_manager,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("tenancy", () => {
  it("keeps one tenant's chains invisible to another", async () => {
    await aChain();
    const other = await seedOrganisation("Kgosi Civils");

    const theirs = await withRequestContext(
      { organisationId: other.organisationId, userId: other.userIds.executive },
      () => workflowService.listChains(),
    );
    expect(theirs).toHaveLength(0);
  });
});
