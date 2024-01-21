import { isEntity } from "joist-orm";
import { Context, ContextFn, run } from "joist-test-utils";
import { ResolverResult, ResolverRoot } from "./typeUtils";

/**
 * Creates a `makeRunObjectFields` function for each project's `testUtils` file.
 *
 * This is called `makeMake` because it's a factory for each project's `testUtils` to make its own factory
 * that is customized (basically curried) to their own `newContext` function.
 */
export function makeMakeRunObjectFields<C extends Context, T, R extends ResolverRoot<T>>(
  newContext: ContextFn<C>,
): MakeRunObjectFields<C> {
  return (resolver) => {
    return (ctx, root, fields) => {
      return run(
        ctx,
        async (ctx) => {
          const _root = isEntity(root) ? await ctx.em.load((root as any).id) : root;
          // Build a result with each key, where fields might return a promise, so we `await` to make assertions easier
          return Object.fromEntries(
            await Promise.all(
              fields.map(async (key) => [key, await (resolver[key] as any)(_root, {}, ctx, undefined!)]),
            ),
          );
        },
        newContext,
      );
    };
  };
}

/** Creates a `run` method that can invoke multiple fields against an object resolver. */
export type MakeRunObjectFields<C extends Context> = <T, R extends ResolverRoot<T>>(
  resolvers: T,
) => RunFieldsResolverMethod<C, T, R>;

// The return type for makeRunResolverKeys
type RunFieldsResolverMethod<C extends Context, T, R extends ResolverRoot<T>> = <K extends (keyof T)[]>(
  ctx: C,
  root: R,
  keys: K,
) => Promise<{ [k in K[number]]: ResolverResult<T, k> }>;
