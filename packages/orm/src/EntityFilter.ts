import { FilterOf, OrderOf } from "./EntityManager";

/**
 * Combines a `where` filter with optional `orderBy`, `limit`, and `offset` settings.
 */
export type FilterAndSettings<T> = {
  where: FilterOf<T>;
  orderBy?: OrderOf<T>;
  limit?: number;
  offset?: number;
};

export type OrderBy = "ASC" | "DESC";

/**
 * A filter for an entity of type `T`.
 *
 * @typeparam T The entity type, i.e. `Author`
 * @typeparam I The ID type of the entity, i.e. `AuthorId`
 * @typeparam F The filter type for the entity, i.e. `AuthorFilter`
 * @typeparam N Either `null | undefined` if the entity can be null, or `never` if it cannot.
 */
export type EntityFilter<T, I, F, N> = T | T[] | I | I[] | F | N | { ne: T | I | N };

export type BooleanFilter<N> = true | false | N;

export type ValueFilter<V, N> =
  | V
  | V[]
  | N
  // Both eq and in are redundant with `V` and `V[]` above but are convenient for matching GQL filter APIs
  | { eq: V | N }
  | { in: V[] }
  | { gt: V }
  | { gte: V }
  | { ne: V | N }
  | { lt: V }
  | { lte: V }
  | { like: V }
  | { ilike: V }
  | { gte: V; lte: V };
