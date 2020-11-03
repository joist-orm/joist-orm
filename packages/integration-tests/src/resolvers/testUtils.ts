import { Context } from "@src/context";
import { Entity } from "joist-orm";
import { Resolver } from "@src/generated/graphql-types";

// Returns the keys of resolver T that only take no arguments.
type NoArgKeys<T> = keyof {
  [K in keyof T]: T[K] extends Resolver<any, {}, any> ? T[K] : never;
};

// For a type-union of keys `KS`, return what each key is in the resolver `T`.
type ResolverResult<T, KS> = {
  [K1 in keyof KS]: K1 extends keyof T ? T[K1] : never;
};

// The return type for makeRunResolverKeys
type RunKeysResolverMethod<T, R> = <K extends Array<NoArgKeys<T>>>(
  ctx: Context,
  root: (R extends string ? Entity : never) | (() => R),
  keys: K,
) => Promise<ResolverResult<T, K>>;

/** Creates a `runResolverKeys` method that can invoke multiple keys against a resolver. */
export function makeRunResolverKeys<T, R>(resolver: T): RunKeysResolverMethod<T, R> {
  return async (ctx: Context, root: (R extends string ? Entity : never) | (() => R), keys) => {
    return {} as any;
    // return await run(ctx, async (ctx) => {
    //   // Build a result with each key, where keys might return a promise, so we `await` to make assertions easier
    //   return Object.fromEntries(
    //     await Promise.all(
    //       keys.map(async (key) => {
    //         return [key, await (resolver[key] as any)(isEntity(root) ? root.idOrFail : root(), {}, ctx, undefined!)];
    //       }),
    //     ),
    //   );
    // });
  };
}
