import { isEntity } from "joist-orm";
import { run } from "joist-test-utils";
import { Context } from "./context";
import { ResolverResult, ResolverRoot } from "./makeRunObject";

/** Creates a `run` method that can invoke multiple keys against a resolver. */
export function makeRunObjectFields<T, R extends ResolverRoot<T>>(resolver: T): RunKeysResolverMethod<T, R> {
  return (ctx, root, keys) => {
    return run(ctx, async (ctx) => {
      const _root = isEntity(root) ? await ctx.em.load((root as any).idOrFail) : root;
      // Build a result with each key, where keys might return a promise, so we `await` to make assertions easier
      return Object.fromEntries(
        await Promise.all(keys.map(async (key) => [key, await (resolver[key] as any)(_root, {}, ctx, undefined!)])),
      );
    });
  };
}

// The return type for makeRunResolverKeys
type RunKeysResolverMethod<T, R extends ResolverRoot<T>> = <K extends (keyof T)[]>(
  ctx: Context,
  root: R,
  keys: K,
) => Promise<{ [k in K[number]]: ResolverResult<T, k> }>;
