import { isEntity } from "joist-orm";
import { Context, ContextFn, run } from "joist-test-utils";
import { ResolverArgs, ResolverResult, ResolverRoot } from "./typeUtils";

/**
 * Creates a `makeRunObjectField` function for each project's `testUtils` file.
 *
 * This is called `makeMake` because it's a factory for each project's `testUtils` to make its own factory
 * that is customized (basically curried) to their own `newContext` function.
 */
export function makeMakeRunObjectField<C extends Context>(newContext: ContextFn<C>): MakeRunObjectField<C> {
  return (resolvers) => {
    return (ctx, root, key, args) =>
      run(
        ctx,
        async (ctx) => {
          const _root = isEntity(root) ? await ctx.em.load((root as any).id) : root;
          return (resolvers[key] as any)(_root, args instanceof Function ? args() : args ?? {}, ctx, undefined!);
        },
        newContext,
      );
  };
}

/** Creates a `run` method to invoke a single field resolver with that field's args. */
export type MakeRunObjectField<C> = <T extends object, R extends ResolverRoot<T>>(
  resolvers: T,
) => RunObjectFieldMethod<C, T, R>;

/** The return type of `makeRunObject`. */
type RunObjectFieldMethod<C, T, R> = <K extends keyof T, A extends ResolverArgs<T, K>>(
  ctx: C,
  root: R,
  key: K,
  // Support either the resolver arg directly or a lambda to create the args post-flush
  args?: A | (() => A),
) => Promise<ResolverResult<T, K>>;
