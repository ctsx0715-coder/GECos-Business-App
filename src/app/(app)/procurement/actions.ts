"use server";

import { revalidatePath } from "next/cache";
import { withSession } from "@/lib/auth/session";
import { runFormAction } from "@/lib/forms/run-form-action";
import { procurementService } from "@/modules/procurement/procurement.service";
import type { FormResult } from "@/components/forms";

/**
 * Server actions for the procurement screens.
 *
 * Bind the session's tenant context, call the service, translate errors. Every
 * rule these appear to enforce is enforced in the service, so a hand-rolled
 * request that skips this file hits the same wall (ADR-008).
 */

/** An order's screens, plus everything that shows a total derived from it. */
function refreshOrder(id: string) {
  revalidatePath(`/procurement/orders/${id}`);
  revalidatePath("/procurement/orders");
  revalidatePath("/procurement");
  // The project budget counts approved orders as committed, so it goes stale
  // the moment one is approved, received against or closed.
  revalidatePath("/projects", "layout");
}

export async function createSupplierAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => procurementService.createSupplier(input)),
    // Back to the register rather than to the supplier: the next thing that
    // has to happen is somebody else clearing them, and that is done there.
    () => ({ ok: true, redirectTo: "/procurement/suppliers" }),
  );
  revalidatePath("/procurement/suppliers");
  return result;
}

export async function updateSupplierAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.updateSupplier(input)),
  );
  revalidatePath("/procurement/suppliers");
  return result;
}

export async function decideSupplierAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.decideSupplier(input)),
  );
  revalidatePath("/procurement/suppliers");
  revalidatePath("/procurement");
  return result;
}

export async function createOrderAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(
    () => withSession(() => procurementService.createOrder(input)),
    (order) => ({ ok: true, redirectTo: `/procurement/orders/${order!.id}` }),
  );
  revalidatePath("/procurement/orders");
  revalidatePath("/procurement");
  return result;
}

export async function addOrderLineAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.addLine(input)),
  );
  refreshOrder(String(input.purchaseOrderId));
  return result;
}

export async function removeOrderLineAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.removeLine(input)),
  );
  refreshOrder(String(input.purchaseOrderId));
  return result;
}

export async function submitOrderAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.submitOrder(input)),
  );
  refreshOrder(String(input.id));
  return result;
}

export async function decideOrderAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.decideOrder(input)),
  );
  revalidatePath("/procurement/orders", "layout");
  revalidatePath("/procurement");
  revalidatePath("/approvals");
  revalidatePath("/projects", "layout");
  return result;
}

export async function cancelOrderAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.cancelOrder(input)),
  );
  refreshOrder(String(input.id));
  return result;
}

export async function closeOrderAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.closeOrder(input)),
  );
  refreshOrder(String(input.id));
  return result;
}

export async function recordReceiptAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.recordReceipt(input)),
  );
  refreshOrder(String(input.purchaseOrderId));
  return result;
}

export async function recordInvoiceAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.recordInvoice(input)),
  );
  refreshOrder(String(input.purchaseOrderId));
  revalidatePath("/procurement/invoices");
  return result;
}

export async function decideInvoiceAction(
  input: Record<string, unknown>,
): Promise<FormResult> {
  const result = await runFormAction(() =>
    withSession(() => procurementService.decideInvoice(input)),
  );
  revalidatePath("/procurement/orders", "layout");
  revalidatePath("/procurement/invoices");
  revalidatePath("/procurement");
  return result;
}
