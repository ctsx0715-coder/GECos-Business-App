/**
 * Application errors that carry an HTTP status.
 *
 * Services throw these; route handlers and server actions map them to
 * responses. The point is that a permission failure is a 403 raised in the
 * service layer — the layer every path goes through — rather than a hidden
 * button in the UI (ADR-008).
 */

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403, "forbidden");
  }
}

export class UnauthorisedError extends AppError {
  constructor(message = "You must be signed in.") {
    super(message, 401, "unauthorised");
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Record") {
    super(`${what} not found.`, 404, "not_found");
  }
}

/** A rule the user could reasonably have broken, e.g. an incomplete checklist. */
export class BusinessRuleError extends AppError {
  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message, 422, "business_rule");
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message, 400, "validation");
  }
}
