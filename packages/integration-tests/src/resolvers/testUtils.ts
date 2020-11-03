import { Context } from "@src/context";
import { Resolver } from "@src/generated/graphql-types";
import { Entity } from "joist-orm";

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
  };
}

export async function run<T>(ctx: Context, fn: (ctx: Context) => Promise<T>): Promise<T> {
  return undefined!;
}
