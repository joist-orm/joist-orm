import { run } from "joist-test-utils";
import { Context } from "./context";
import { ResolverArgs, ResolverResult } from "./makeRunObject";

/**
 * Creates a `run` method to invoke a query resolver.
 *
 * Following our `query / foo` conventions, `resolver` will have a single `fooResolver.foo` method.
 */
export function makeRunQuery<T extends object>(resolver: T): RunQueryMethod<T> {
  return (ctx, args) =>
    run(ctx, async (ctx) => {
      const key = Object.keys(resolver)[0];
      return ((resolver as any)[key] as any)({}, args instanceof Function ? args() : args ?? {}, ctx, undefined!);
    });
}

// The return type of `makeRunQuery`
type RunQueryMethod<T> = <A extends ResolverArgs<T, keyof T>>(
  ctx: Context,
  // Support either the resolver arg directly or a lambda to create the args post-flush
  args?: A | (() => A),
) => Promise<ResolverResult<T, keyof T>>;
