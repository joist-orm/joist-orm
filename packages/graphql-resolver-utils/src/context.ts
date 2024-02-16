import { GraphQLResolveInfo } from "graphql/type";

export type MaybePromise<T> = T | Promise<T>;

// Kinda odd that ctx needs to be any here...
export type Resolver<R, A, T> = (root: R, args: A, ctx: any, info: GraphQLResolveInfo) => MaybePromise<T>;
