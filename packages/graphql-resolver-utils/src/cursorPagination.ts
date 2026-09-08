import {
  type Entity,
  type FindGqlFilterOptions,
  type IdOf,
  type MaybeAbstractEntityConstructor,
  type ValueGraphQLFilter,
} from "joist-core";

import {
  type ContextWithEm,
  type PaginationFilter,
  type PaginationQuery,
  countQuery,
  defaultLimit,
  queryEntities,
} from "./paginationUtils.ts";

type CursorArgs<T extends Entity, F extends object = PaginationFilter<T>> = {
  filter?: F | null;
  first?: number | null;
  after?: string | null;
  last?: number | null;
  before?: string | null;
};

/** Returns an ID-ordered cursor connection for a resolver, replacing the entity query's ordering. */
export function paginateCursor<T extends Entity>(
  ctx: ContextWithEm,
  query: PaginationQuery<T>,
  args: Omit<CursorArgs<T>, "filter">,
): Promise<{ edges: { node: T; cursor: string }[]; nodes: T[]; pageInfo: CursorPageInfo<T> }>;
export function paginateCursor<T extends Entity, F extends object = PaginationFilter<T>>(
  ctx: ContextWithEm,
  type: MaybeAbstractEntityConstructor<T>,
  args: CursorArgs<T, F>,
): Promise<{ edges: { node: T; cursor: string }[]; nodes: T[]; pageInfo: CursorPageInfo<T> }>;
export async function paginateCursor<T extends Entity, F extends object = PaginationFilter<T>>(
  ctx: ContextWithEm,
  type: MaybeAbstractEntityConstructor<T> | PaginationQuery<T>,
  args: CursorArgs<T, F>,
): Promise<{ edges: { node: T; cursor: string }[]; nodes: T[]; pageInfo: CursorPageInfo<T> }> {
  const limit = args.first ?? args.last ?? defaultLimit;
  const baseFilter = (args.filter ?? {}) as PaginationFilter<T>;
  const filter = withCursorFilter(baseFilter, args);
  const orderBy = { id: args.last ? "DESC" : "ASC" } as FindGqlFilterOptions<T>["orderBy"];
  const nodes =
    typeof type === "function"
      ? await ctx.em.findGql(type, filter, { limit, orderBy })
      : await queryEntities(ctx, {
          ...withCursorQuery(type, args),
          orderBy: [args.last ? { desc: type.select.id } : { asc: type.select.id }],
          limit,
          offset: undefined,
        });
  const orderedNodes = args.last ? [...nodes].reverse() : nodes;
  const edges = orderedNodes.map((node) => ({ node, cursor: encodeCursor(String(node.id)) }));
  return {
    edges,
    nodes: orderedNodes,
    pageInfo: new CursorPageInfo(
      ctx,
      typeof type === "function" ? type : { ...type, orderBy: undefined },
      baseFilter,
      edges,
    ),
  };
}

/** Lazily computes cursor page fields. */
export class CursorPageInfo<T extends Entity = Entity> {
  #ctx: ContextWithEm;
  #edges: { node: T; cursor: string }[];
  #filter: PaginationFilter<T>;
  #hasNextPagePromise: Promise<boolean> | undefined;
  #hasPreviousPagePromise: Promise<boolean> | undefined;
  #totalCountPromise: Promise<number> | undefined;
  #type: MaybeAbstractEntityConstructor<T> | PaginationQuery<T>;

  constructor(
    ctx: ContextWithEm,
    type: MaybeAbstractEntityConstructor<T> | PaginationQuery<T>,
    filter: PaginationFilter<T>,
    edges: { node: T; cursor: string }[],
  ) {
    this.#ctx = ctx;
    this.#type = type;
    this.#filter = filter;
    this.#edges = edges;
  }

  get startCursor(): string | undefined {
    return this.#edges[0]?.cursor;
  }

  get endCursor(): string | undefined {
    return this.#edges[this.#edges.length - 1]?.cursor;
  }

  get hasNextPage(): Promise<boolean> {
    return (this.#hasNextPagePromise ??= this.#countPastCursor("after", this.endCursor));
  }

  get hasPreviousPage(): Promise<boolean> {
    return (this.#hasPreviousPagePromise ??= this.#countPastCursor("before", this.startCursor));
  }

  get totalCount(): Promise<number> {
    return (this.#totalCountPromise ??=
      typeof this.#type === "function"
        ? this.#ctx.em.findCount(this.#type, this.#filter)
        : countQuery(this.#ctx, this.#type));
  }

  /** Counts rows past a cursor only when the field is requested. */
  async #countPastCursor(direction: "after" | "before", cursor: string | undefined): Promise<boolean> {
    if (!cursor) return false;
    if (typeof this.#type !== "function") {
      return (await countQuery(this.#ctx, withCursorQuery(this.#type, { [direction]: cursor }))) > 0;
    }
    const filter = withCursorFilter(this.#filter, { [direction]: cursor });
    return (await this.#ctx.em.findCount(this.#type, filter)) > 0;
  }
}

/** Adds both cursor bounds without replacing the query's existing conditions. */
function withCursorQuery<T extends Entity>(
  base: PaginationQuery<T>,
  args: { after?: string | null; before?: string | null },
): PaginationQuery<T> {
  return {
    ...base,
    where: {
      and: [
        base.where,
        args.after ? base.select.id.gt(decodeCursor(args.after) as IdOf<T>) : undefined,
        args.before ? base.select.id.lt(decodeCursor(args.before) as IdOf<T>) : undefined,
      ],
    },
  };
}

/** Adds cursor bounds to a filter. */
function withCursorFilter<T extends Entity>(
  filter: PaginationFilter<T>,
  args: { after?: string | null; before?: string | null },
): PaginationFilter<T> {
  const cursor = args.after ?? args.before;
  if (!cursor) return filter;
  const op = args.after ? "gt" : "lt";
  return { ...filter, id: { [op]: decodeCursor(cursor) } as ValueGraphQLFilter<string> } as PaginationFilter<T>;
}

/** Encodes an entity id as an opaque cursor. */
function encodeCursor(id: string): string {
  return Buffer.from(id).toString("base64");
}

/** Decodes an opaque cursor back into an entity id. */
function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64").toString("utf8");
}
