import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped context carried alongside every database call.
 *
 * This is AsyncLocalStorage rather than something set in `proxy.ts`, because
 * proxy runs at the network boundary and cannot share state with server
 * components or server actions. Everything below the service layer reads the
 * tenant from here, so no caller has to remember to pass it.
 */
export interface RequestContext {
  /** The tenant every query is scoped to. */
  organisationId: string;
  /** Local user id (never a Clerk id — see ADR-002). Null for system jobs. */
  userId: string | null;
  ipAddress?: string;
  userAgent?: string;
  /**
   * Set by background jobs and seeds, which legitimately act without a signed
   * in user. Audit rows record the actor as null but still capture the action.
   */
  isSystem?: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `fn` with the given context bound to every database call inside it.
 *
 * The inner `await` is load-bearing, not stylistic. Prisma promises are lazy:
 * they do not run the query until something calls `.then` on them. Passing
 * `storage.run` a callback that merely *returns* a Prisma promise would leave
 * the query to execute when it is awaited by the caller — outside this scope,
 * with no store bound. Awaiting inside keeps execution within the context.
 *
 *   withRequestContext(ctx, () => db.tender.findMany())    // fixed by this
 *   withRequestContext(ctx, async () => db.tender.findMany())
 *
 * Both forms now work. Without the await, only the second did, and the first
 * failed at runtime with a confusing "no request context bound".
 */
export function withRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T> | T,
): Promise<T> {
  return storage.run(context, async () => await fn());
}

/** The current context, or undefined outside a bound scope. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * The current context, or a thrown error.
 *
 * The extension calls this for tenant-scoped models. Throwing is deliberate:
 * a query that reaches the database without a tenant is a bug, and failing
 * loudly at the call site is far cheaper than discovering a cross-tenant leak
 * in production.
 */
export function requireRequestContext(): RequestContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error(
      "No request context bound. Tenant-scoped database access must run inside " +
        "withRequestContext(). If this is a background job or seed, wrap it in " +
        "withSystemContext(organisationId).",
    );
  }
  return context;
}

/** Context for cron jobs, seeds and other work with no signed in user. */
export function withSystemContext<T>(
  organisationId: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  return withRequestContext(
    { organisationId, userId: null, isSystem: true },
    fn,
  );
}
