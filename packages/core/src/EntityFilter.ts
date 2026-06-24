import { Alias } from "./Aliases";
import { Entity } from "./Entity";
import { FindFilterOptions, IdOf } from "./EntityManager";
import { ColumnCondition, RawCondition } from "./QueryParser";
import { isScope, resolveScope, type Scope } from "./scopes";
import { FieldsOf, FilterOf, OrderOf } from "./typeMap";

/** Combines a `where` filter with optional `orderBy`, `limit`, and `offset` settings. */
export type FilterAndSettings<T extends Entity> = {
  // Either a `{ ... }` EntityFilter or a Scope like `Adult.parent`
  where: FindFilter<T>;
  conditions?: ExpressionFilter;
  orderBy?: OrderOf<T> | OrderOf<T>[];
  limit?: number | undefined;
  offset?: number | undefined;
  softDeletes?: "exclude" | "include";
  allowMultipleLeftJoins?: boolean;
  optimizeJoinsToExists?: boolean;
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
  | Scope<T>
  // Note that this is a weak type (all optional keys) but TS still enforces at least one overlap
  | EntityFilterObject<T, I, F, N>
  // Always allow `undefined` for condition pruning
  | undefined
  // But only allow `null` for `nullable` relations
  | N
  | { ne: T | I | N | undefined }
  // Allow setting `true` for `is not null` or `false` for `is null`
  | boolean
  | Alias<T>;

/** A nested object filter, including logical composition at the current entity alias. */
export type EntityFilterObject<T extends Entity, I = IdOf<T>, F = FilterOf<T>, N = never> = {
  as?: Alias<T>;
  and?: EntityFilter<T, I, F, N> | readonly EntityFilter<T, I, F, N>[];
  or?: EntityFilter<T, I, F, N> | readonly EntityFilter<T, I, F, N>[];
} & F;

export type BooleanFilter<N> = true | false | N;

/**
 * The root `em.find` `where` shape: an `EntityFilterObject` with `I`/`F`/`N` defaulted.
 *
 * Intentionally a thin alias rather than the source of truth: `as`/`and`/`or` are defined once on
 * `EntityFilterObject<T, I, F, N>` so the parameterized nested-relation arm of `EntityFilter` and this
 * root can't drift. That arm needs the `F`/`N` params — GraphQL filter shapes (`F`) and relation
 * nullability (`N`) flow through `and`/`or` recursion — which a `FilterOf<T>`-hardcoded root can't
 * supply, so the shape lives on `EntityFilterObject` and this just specializes it.
 */
export type FilterWithAlias<T extends Entity> = EntityFilterObject<T>;

/** Allows `em.find` to accept either a `{ ... }` EntityFilter or a Scope like `Adult.parent` */
export type FindFilter<T extends Entity> = FilterWithAlias<T> | Scope<T>;

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
  | { in: readonly (V | N | null)[] | undefined }
  | { nin: readonly (V | N)[] | undefined }
  | { gt: V | undefined }
  | { gte: V | undefined }
  | { lt: V | undefined }
  | { lte: V | undefined }
  | { like: V | undefined }
  | { nlike: V | undefined }
  | { ilike: V | undefined }
  | { nilike: V | undefined }
  | { regex?: V | undefined }
  | { iregex?: V | undefined }
  | { nregex?: V | undefined }
  | { niregex?: V | undefined }
  | { search: V | undefined }
  // should put these in a dedicated ArrayFilter
  | { contains: V | undefined }
  | { overlaps: V | undefined }
  | { containedBy: V | undefined }
  // should put these in a dedicated JsonbFilter
  | { pathExists: string | undefined }
  | { pathIsTrue: string | undefined }
  // this is between
  | { gte: V | undefined; lte: V | undefined }
  | { between: [V, V] | undefined };

/**
 * Filters against complex expressions of filters.
 *
 * This is the user-facing DSL that internally will be converted to `ParsedExpressionFilter.
 */
export type ExpressionFilter = (
  | { and: Array<ExpressionCondition | undefined>; or?: never }
  | { or: Array<ExpressionCondition | undefined>; and?: never }
) & { pruneIfUndefined?: "any" | "all" };

/** A user-facing filter for maybe-nested/maybe-simple conditions. */
export type ExpressionCondition = ExpressionFilter | ColumnCondition | RawCondition;

/** Merges root-scope find settings with caller options, letting caller options win. */
export function mergeFindOptions<T extends Entity>(
  where: FindFilter<T>,
  options: FindFilterOptions<T>,
): { where: FindFilter<T>; options: FindFilterOptions<T> } {
  if (!isScope<T>(where)) return { where, options };

  const resolved = resolveScope(where);
  const scopeOptions: FindFilterOptions<T> = {};
  if (resolved.orderBys.length > 0) scopeOptions.orderBy = resolved.orderBys;
  if (resolved.limit !== undefined) scopeOptions.limit = resolved.limit;
  if (resolved.offset !== undefined) scopeOptions.offset = resolved.offset;
  if (resolved.softDeletes !== undefined) scopeOptions.softDeletes = resolved.softDeletes;
  return { where, options: { ...scopeOptions, ...options } };
}
