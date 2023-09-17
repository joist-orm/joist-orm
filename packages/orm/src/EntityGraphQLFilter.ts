import { Alias } from "./Aliases";
import { Entity } from "./Entity";
import { EntityFilter, ExpressionFilter } from "./EntityFilter";
import { GraphQLFilterOf, OrderOf } from "./EntityManager";

export type GraphQLFilterWithAlias<T extends Entity> = { as?: Alias<T> } & GraphQLFilterOf<T>;

/** Combines a `where` filter with optional `orderBy`, `limit`, and `offset` settings. */
export type GraphQLFilterAndSettings<T extends Entity> = {
  where: GraphQLFilterWithAlias<T>;
  conditions?: ExpressionFilter;
  orderBy?: OrderOf<T>;
  limit?: number | null;
  offset?: number | null;
  softDeletes?: "exclude" | "include";
};

/**
 * This essentially matches the ValueFilter but with looser types to placate GraphQL.
 */
export type ValueGraphQLFilter<V> =
  | {
      eq?: V | null;
      in?: readonly V[] | null;
      nin?: readonly V[] | null;
      gt?: V | null;
      gte?: V | null;
      ne?: V | null;
      lt?: V | null;
      lte?: V | null;
      like?: V | null;
      ilike?: V | null;
      between?: readonly V[] | null;
      contains?: V | null;
      overlaps?: V | null;
      containedBy?: V | null;
    }
  | { op: Operator; value: V | readonly V[] | undefined | null }
  | V
  | readonly V[]
  | null;

export type BooleanGraphQLFilter = true | false | null;

export const operators = [
  "eq",
  "gt",
  "gte",
  "ne",
  "lt",
  "lte",
  "like",
  "ilike",
  "in",
  "nin",
  "between",
  "contains",
  "overlaps",
  "containedBy",
] as const;

export type Operator = (typeof operators)[number];

export const opToFn: Record<Exclude<Operator, "in" | "nin" | "between">, string> = {
  eq: "=",
  gt: ">",
  gte: ">=",
  ne: "!=",
  lt: "<",
  lte: "<=",
  like: "LIKE",
  ilike: "ILIKE",
  contains: "@>",
  containedBy: "<@",
  overlaps: "&&",
};

/** A GraphQL version of EntityFilter. */
export type EntityGraphQLFilter<T extends Entity, I, F, N> = EntityFilter<T, I, F, N> | null;
