import { Resolver } from "./context";

/** Infers the root type of the given resolver, by assuming it's always the first arg. */
export type ResolverRoot<T> = T extends { [key in keyof T]: infer F }
  ? F extends Resolver<infer R, any, any>
    ? R
    : never
  : never;

export type ResolverArgs<T, K extends keyof T> = T[K] extends Resolver<any, infer U, any> ? U : never;

/** Infers the return type of key `K` in the resolver object `T`. */
export type ResolverResult<T, K extends keyof T> = T[K] extends Resolver<any, any, infer U> ? U : never;
