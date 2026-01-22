import { isEntity } from "joist-orm";
import { ResolverResult, ResolverRoot, RunFn } from "./typeUtils";

/**
 * Creates a `makeRunObjectFields` function for each project's `testUtils` file.
 *
 * This is called `makeMake` because it's a factory for each project's `testUtils` to make its own factory
 * that is customized (basically curried) to their own `newContext` function.
 */
export function makeMakeRunObjectFields<C, T>(runFn: RunFn<C>): MakeRunObjectFields<C> {
  return (resolver) => {
    return (ctx, root, fields) => {
      return runFn(ctx, async (ctx) => {
        // Sneak in a Joist-ism that will load the entity in the new em
        const _root = isEntity(root) ? await (ctx as any).em.load((root as any).id) : root;
        // Build a result with each key, where fields might return a promise, so we `await` to make assertions easier
        return Object.fromEntries(
          await Promise.all(fields.map(async (key) => [key, await (resolver[key] as any)(_root, {}, ctx, undefined!)])),
        );
      });
    };
  };
}

/** Creates a `run` method that can invoke multiple fields against an object resolver. */
export type MakeRunObjectFields<C> = <T, R extends ResolverRoot<T>>(resolvers: T) => RunFieldsResolverMethod<C, T, R>;

// The return type for makeRunResolverKeys
type RunFieldsResolverMethod<C, T, R extends ResolverRoot<T>> = <K extends (keyof T)[]>(
  ctx: C,
  root: R,
  keys: K,
) => Promise<{ [k in K[number]]: ResolverResult<T, k> }>;
