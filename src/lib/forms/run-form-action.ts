import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import type { FormResult } from "@/components/forms";

/**
 * Runs a create/update action and translates failures into something a form
 * can render.
 *
 * Three failure shapes, three treatments. A Zod error becomes field-level
 * errors so they appear against the offending input. An AppError — forbidden,
 * not found, a broken business rule — becomes a form-level message, because it
 * is rarely about one field. Anything else is a genuine fault and is rethrown
 * so it reaches the error boundary rather than being shown as a validation hint.
 */
export async function runFormAction<T>(
  fn: () => Promise<T>,
  onSuccess?: (value: T) => FormResult,
): Promise<FormResult> {
  try {
    const value = await fn();
    return onSuccess?.(value) ?? { ok: true };
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".") || "_form";
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      return {
        ok: false,
        message: "Check the highlighted fields.",
        fieldErrors,
      };
    }

    if (error instanceof AppError) {
      return { ok: false, message: error.message };
    }

    throw error;
  }
}
