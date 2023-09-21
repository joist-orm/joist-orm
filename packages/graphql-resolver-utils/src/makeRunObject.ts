import { isEntity } from "joist-orm";
import { run } from "joist-test-utils";
import { Context, Resolver } from "./context";

export type ResolverRoot<T> = T extends { [key in keyof T]: infer F }
  ? F extends Resolver<infer R, any, any>
    ? R
    : never
  : never;
export type ResolverArgs<T, K extends keyof T> = T[K] extends Resolver<any, infer U, any> ? U : never;
export type ResolverResult<T, K extends keyof T> = T[K] extends Resolver<any, any, infer U> ? U : never;

/** The return type of `makeRunObject`. */
type RunResolverMethod<T, R> = <K extends keyof T, A extends ResolverArgs<T, K>>(
  ctx: Context,
  root: R,
  key: K,
  // Support either the resolver arg directly or a lambda to create the args post-flush
  args?: A | (() => A),
) => Promise<ResolverResult<T, K>>;

/** Creates a `run` method to invoke a specific resolver key with that key's args. */
export function makeRunObject<T, R extends ResolverRoot<T>>(resolvers: T): RunResolverMethod<T, R> {
  return (ctx, root, key, args) =>
    run(ctx, async (ctx) => {
      const _root = isEntity(root) ? await ctx.em.load((root as any).id) : root;
      return (resolvers[key] as any)(_root, args instanceof Function ? args() : args ?? {}, ctx, undefined!);
    });
}
