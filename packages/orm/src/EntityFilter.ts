import { Alias } from "./Aliases";
import { Entity } from "./Entity";
import { FieldsOf, FilterOf, IdOf, OrderOf } from "./EntityManager";
import { ColumnCondition } from "./QueryParser";

/** Combines a `where` filter with optional `orderBy`, `limit`, and `offset` settings. */
export type FilterAndSettings<T extends Entity> = {
  where: FilterWithAlias<T>;
  conditions?: ExpressionFilter;
  orderBy?: OrderOf<T>;
  limit?: number;
  offset?: number;
  softDeletes?: "exclude" | "include";
};

export type OrderBy = "ASC" | "DESC";

/**
 * A filter for an entity of type `T` for `em.find` inline conditions.
 *
 * An entity filter can either filter by "an exact entity" (i.e. the book with id 2)
 * or its own set of filters (i.e. all books with a title that starts with "The").
 *
 * @typeparam T The entity type, i.e. `Author`
 * @typeparam I The ID type of the entity, i.e. `AuthorId`
 * @typeparam F The filter type for the entity, i.e. `AuthorFilter`
 * @typeparam N Either `null | undefined` if the entity can be null, or `never` if it cannot.
 */
export type EntityFilter<T extends Entity, I = IdOf<T>, F = FilterOf<T>, N = never> =
  | T
  | readonly T[]
  | I
  | readonly I[]
  // Note that this is a weak type (all optional keys) but TS still enforces at least one overlap
  | ({ as?: Alias<T> } & F)
  // Always allow `undefined` for condition pruning
  | undefined
  // But only allow `null` for `nullable` relations
  | N
  | { ne: T | I | N | undefined }
  // Allow setting `true` for `is not null` or `false` for `is null`
  | boolean
  | Alias<T>;

export type BooleanFilter<N> = true | false | N;

export type FilterWithAlias<T extends Entity> = { as?: Alias<T> } & FilterOf<T>;

export type UniqueFilter<T extends Entity> = {
  [K in keyof FieldsOf<T> & keyof FilterOf<T> as FieldsOf<T>[K] extends { unique: true } ? K : never]?: FilterOf<T>[K];
};

/**
 * Filters against a specific field's values within `em.find` inline conditions.
 *
 * We always allow `undefined` to support condition pruning, but only conditionally
 * allow `null` if the column is actually nullable.
 */
export type ValueFilter<V, N> =
  | V
  | readonly V[]
  | N
  | undefined
  // Both eq and in are redundant with `V` and `V[]` above but are convenient for matching GQL filter APIs
  | { eq: V | N | undefined }
  | { ne: V | N | undefined }
  | { in: readonly (V | N)[] | undefined }
  | { nin: readonly (V | N)[] | undefined }
  | { gt: V | undefined }
  | { gte: V | undefined }
  | { lt: V | undefined }
  | { lte: V | undefined }
  | { like: V | undefined }
  | { nlike: V | undefined }
  | { ilike: V | undefined }
  | { nilike: V | undefined }
  // should put these in a dedicated ArrayFilter
  | { contains: V | undefined }
  | { overlaps: V | undefined }
  | { containedBy: V | undefined }
  // this is between
  | { gte: V | undefined; lte: V | undefined }
  | { between: [V, V] | undefined };

/** Filters against complex expressions of filters. */
export type ExpressionFilter = (
  | { and: Array<ExpressionFilter | ColumnCondition | undefined>; or?: never }
  | { or: Array<ExpressionFilter | ColumnCondition | undefined>; and?: never }
) & { pruneIfUndefined?: "any" | "all" };
