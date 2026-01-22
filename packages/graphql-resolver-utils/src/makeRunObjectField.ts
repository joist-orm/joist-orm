import { isEntity } from "joist-core";
import { ResolverArgs, ResolverResult, ResolverRoot, RunFn } from "./typeUtils";

/**
 * Creates a `makeRunObjectField` function for each project's `testUtils` file.
 *
 * This is called `makeMake` because it's a factory for each project's `testUtils` to make its own factory
 * that is customized (basically curried) to their own `newContext` function.
 */
export function makeMakeRunObjectField<C>(runFn: RunFn<C>): MakeRunObjectField<C> {
  return (resolvers) => {
    return (ctx, root, key, args) =>
      runFn(ctx, async (ctx) => {
        // Sneak in a Joist-ism that will load the entity in the new em
        const _root = isEntity(root) ? await (ctx as any).em.load((root as any).id) : root;
        return (resolvers[key] as any)(_root, args instanceof Function ? args(_root) : (args ?? {}), ctx, undefined!);
      });
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
  args?: A | ((root: R) => A),
) => Promise<ResolverResult<T, K>>;
