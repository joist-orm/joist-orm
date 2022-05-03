import { Context } from "@src/context";
import { Resolver } from "@src/generated/graphql-types";
import { Entity } from "joist-orm";

// Returns the keys of resolver T that only take no arguments.
type NoArgKeys<T> = keyof {
  [K in keyof T]: T[K] extends Resolver<any, {}, any> ? T[K] : never;
};

// Returns the keys of resolver T that only take no arguments.
export type ResolverRoot<T> = T extends { [key in keyof T]: infer F }
  ? F extends Resolver<infer R, any, any>
    ? R
    : never
  : never;
export type ResolverArgs<T, K extends keyof T> = T[K] extends Resolver<any, infer U, any> ? U : never;
export type ResolverResult<T, K extends keyof T> = T[K] extends Resolver<any, any, infer U> ? U : never;

// The return type for makeRunResolverKeys
type RunKeysResolverMethod<T, R extends ResolverRoot<T>> = <K extends (keyof T)[]>(
  ctx: Context,
  root: R,
  keys: K,
) => Promise<{ [k in K[number]]: ResolverResult<T, k> }>;

/** Creates a `runResolverKeys` method that can invoke multiple keys against a resolver. */
export function makeRunResolverKeys<T, R extends ResolverRoot<T>>(resolver: T): RunKeysResolverMethod<T, R> {
  return async (ctx: Context, root: (R extends string ? Entity : never) | (() => R), keys) => {
    return {} as any;
  };
}

/** Creates a `runResolverKeys` method that can invoke multiple keys against a resolver. */
export function makeRunResolver<T, R extends ResolverRoot<T>>(resolver: T): RunKeysResolverMethod<T, R> {
  return async (ctx: Context, root: (R extends string ? Entity : never) | (() => R), keys) => {
    return {} as any;
  };
}

export async function run<T>(ctx: Context, fn: (ctx: Context) => Promise<T>): Promise<T> {
  return undefined!;
}
