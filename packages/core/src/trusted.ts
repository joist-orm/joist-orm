import { AsyncLocalStorage } from "async_hooks";

const trustedContext = new AsyncLocalStorage<boolean>();

/** Returns true if we're inside a trusted context, i.e. hooks, reactions, validations, or defaults. */
export function isInTrustedContext(): boolean {
  return trustedContext.getStore() === true;
}

/** Runs the given function within a trusted context. */
export function runInTrustedContext<T>(fn: () => T): T {
  return trustedContext.run(true, fn);
}
