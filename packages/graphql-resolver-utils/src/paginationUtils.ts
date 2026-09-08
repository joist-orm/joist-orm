import {
  type Entity,
  type EntityColumn,
  type EntityManager,
  type ExprLike,
  type GraphQLFilterWithAlias,
  type Query,
  type TableFor,
  query,
} from "joist-core";

export type ContextWithEm = { em: EntityManager };
export type PaginationFilter<T extends Entity> = GraphQLFilterWithAlias<T>;
export type PaginationQuery<T extends Entity> = Query<TableFor<T> & { readonly id: EntityColumn<T, never, string> }>;

export const defaultLimit = 100;

/** Executes an entity selection after pagination has been applied. */
export function queryEntities<T extends Entity>(ctx: ContextWithEm, base: PaginationQuery<T>): Promise<T[]> {
  // Widen the phantom entity type so em.query can resolve its conditional scope checks.
  return ctx.em.query(base as PaginationQuery<Entity>) as Promise<T[]>;
}

/** Counts the unpaginated rows, preserving distinct, grouping, and join semantics. */
export async function countQuery<T extends Entity>(ctx: ContextWithEm, base: PaginationQuery<T>): Promise<number> {
  const select: { id: EntityColumn<T, never, string> } & Record<string, ExprLike<unknown>> = { id: base.select.id };
  // Keep references from expression ordering so removing ORDER BY does not prune a join.
  // I.e. ordering Authors by Book title must still count the joined Author/Book rows.
  if (Array.isArray(base.orderBy)) {
    for (const [index, order] of base.orderBy.entries()) {
      const expression = order?.asc ?? order?.desc;
      if (expression) select[`order${index}`] = expression;
    }
  }
  const rows = query({ ...base, select, orderBy: undefined, limit: undefined, offset: undefined });
  const [result] = await ctx.em.query({ from: rows, select: { count: rows.id.count() } });
  return result.count;
}
