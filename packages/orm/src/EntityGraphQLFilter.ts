import { Alias } from "./Aliases";
import { Entity } from "./Entity";
import { EntityFilter } from "./EntityFilter";
import { GraphQLFilterOf } from "./EntityManager";

export type GraphQLFilterWithAlias<T extends Entity> = { as?: Alias<T> } & GraphQLFilterOf<T>;

/**
 * This essentially matches the ValueFilter but with looser types to placate GraphQL.
 */
export type ValueGraphQLFilter<V> =
  | {
      eq?: V | null;
      in?: V[] | null;
      nin?: V[] | null;
      gt?: V | null;
      gte?: V | null;
      ne?: V | null;
      lt?: V | null;
      lte?: V | null;
      like?: V | null;
      ilike?: V | null;
      between?: V[] | null;
      contains?: V | null;
      overlaps?: V | null;
      containedBy?: V | null;
    }
  | { op: Operator; value: V | V[] | undefined | null }
  | V
  | V[]
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

export type Operator = typeof operators[number];

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
