"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth/session";
import { runFormAction } from "@/lib/forms/run-form-action";
import { inventoryService } from "@/modules/inventory/inventory.service";
import type { FormResult } from "@/components/forms";

/**
 * Server actions for the stock screens.
 *
 * Bind the session's tenant context, call the service, translate errors. Every
 * rule these appear to enforce is enforced in the service, so a hand-rolled
 * request that skips this file hits the same wall (ADR-008).
 */

/**
 * Anything that moves stock changes four things at once.
 *
 * The item's page, the register, the module's front page — and the project
 * pages, which show what a site has drawn from the stores. Missing the last
 * one leaves a project manager reading yesterday's figure the moment somebody
 * carries a pallet out of the yard.
 */
function refreshStock(itemId?: string) {
  if (itemId) revalidatePath(`/inventory/items/${itemId}`);
  revalidatePath("/inventory/items");
  revalidatePath("/inventory");
  revalidatePath("/projects", "layout");
}

export async function createStockItemAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => inventoryService.createItem(input)),
    (item) => ({ ok: true, redirectTo: `/inventory/items/${item.id}` }),
  );
  refreshStock();
  return result;
}

export async function updateStockItemAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.updateItem(input)),
  );
  refreshStock(String(input.id));
  return result;
}

export async function createStoreAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.createLocation(input)),
  );
  revalidatePath("/inventory/stores");
  revalidatePath("/inventory");
  return result;
}

export async function updateStoreAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.updateLocation(input)),
  );
  revalidatePath("/inventory/stores");
  revalidatePath("/inventory");
  return result;
}

export async function issueStockAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.issue(input)),
  );
  refreshStock(String(input.stockItemId));
  return result;
}

export async function returnStockAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.returnToStore(input)),
  );
  refreshStock(String(input.stockItemId));
  return result;
}

export async function transferStockAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.transfer(input)),
  );
  refreshStock(String(input.stockItemId));
  return result;
}

export async function adjustStockAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.adjust(input)),
  );
  refreshStock(String(input.stockItemId));
  return result;
}

export async function startCountAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => inventoryService.startCount(input)),
    (count) => ({ ok: true, redirectTo: `/inventory/counts/${count.id}` }),
  );
  revalidatePath("/inventory/counts");
  return result;
}

export async function recordCountLinesAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.recordCountLines(input)),
  );
  revalidatePath(`/inventory/counts/${String(input.id)}`);
  return result;
}

export async function submitCountAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.submitCount(input)),
  );
  revalidatePath(`/inventory/counts/${String(input.id)}`);
  revalidatePath("/inventory/counts");
  revalidatePath("/inventory");
  return result;
}

export async function acceptCountAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.acceptCount(input)),
  );
  // Accepting writes adjustments into the ledger, so every stock figure in the
  // application has just changed.
  revalidatePath(`/inventory/counts/${String(input.id)}`);
  revalidatePath("/inventory/counts");
  refreshStock();
  return result;
}

export async function abandonCountAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => inventoryService.abandonCount(input)),
  );
  revalidatePath(`/inventory/counts/${String(input.id)}`);
  revalidatePath("/inventory/counts");
  revalidatePath("/inventory");
  return result;
}
