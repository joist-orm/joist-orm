import { ResolverArgs, ResolverResult, RunFn } from "./typeUtils";

/**
 * Creates a `makeRunQuery` function for each project's `testUtils` file.
 *
 * This is called `makeMake` because it's a factory for each project's `testUtils` to make its own factory
 * that is customized (basically curried) to their own `newContext` function.
 */
export function makeMakeRunQuery<C>(runFn: RunFn<C>): MakeRunQuery<C> {
  return (resolver) => {
    return (ctx, args) =>
      runFn(ctx, async (ctx) => {
        const key = Object.keys(resolver)[0];
        return ((resolver as any)[key] as any)({}, args instanceof Function ? args() : args ?? {}, ctx, undefined!);
      });
  };
}

/**
 * Creates a `run` method that invokes the query resolver's single query.
 *
 * Following our `query / foo` conventions, query resolver will have a single `fooResolver.foo` method.
 */
export type MakeRunQuery<C> = <T extends object>(resolver: T) => RunQueryMethod<C, T>;

/** The return type of `makeRunQuery`. */
type RunQueryMethod<C, T> = <A extends ResolverArgs<T, keyof T>>(
  ctx: C,
  // Support either the resolver arg directly or a lambda to create the args post-flush
  args?: A | (() => A),
) => Promise<ResolverResult<T, keyof T>>;
