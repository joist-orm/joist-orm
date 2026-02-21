import { Alias } from "./Aliases";
import { Entity } from "./Entity";
import { EntityFilter, ExpressionFilter } from "./EntityFilter";
import { GraphQLFilterOf, OrderOf } from "./typeMap";

export type GraphQLFilterWithAlias<T extends Entity> = { as?: Alias<T> } & GraphQLFilterOf<T>;

/** Combines a `where` filter with optional `orderBy`, `limit`, and `offset` settings. */
export type GraphQLFilterAndSettings<T extends Entity> = {
  where: GraphQLFilterWithAlias<T>;
  conditions?: ExpressionFilter;
  orderBy?: OrderOf<T>;
  limit?: number | null;
  offset?: number | null;
  softDeletes?: "exclude" | "include";
  /** Force all collection joins to use LATERAL + BOOL_OR instead of LEFT JOIN + DISTINCT ON. */
  lateralJoins?: boolean;
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
      nlike?: V | null;
      ilike?: V | null;
      nilike?: V | null;
      regex?: V | null;
      iregex?: V | null;
      nregex?: V | null;
      niregex?: V | null;
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
  "nlike",
  "ilike",
  "nilike",
  // Regular expression operators
  "regex",
  "iregex",
  "nregex",
  "niregex",
  "in",
  "nin",
  "between",
  "contains",
  "overlaps",
  "containedBy",
  "jsonPathExists",
  "jsonPathPredicate",
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
  nlike: "NOT LIKE",
  ilike: "ILIKE",
  nilike: "NOT ILIKE",
  // Regular expression operators
  regex: "~",
  iregex: "~*",
  nregex: "!~",
  niregex: "!~*",
  // containsAll / hasAll
  contains: "@>",
  containedBy: "<@",
  // containsSome / hasSome
  overlaps: "&&",
  // Kinda weird, but escape the operator for knex
  jsonPathExists: "@\\?",
  jsonPathPredicate: "@@",
};

/** A GraphQL version of EntityFilter. */
export type EntityGraphQLFilter<T extends Entity, I, F, N> = EntityFilter<T, I, F, N> | null;
