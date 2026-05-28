import {
  type Entity,
  type FindGqlFilterOptions,
  type MaybeAbstractEntityConstructor,
  type ValueGraphQLFilter,
} from "joist-core";
import { type ContextWithEm, defaultLimit, type PaginationFilter } from "./paginationUtils";

type CursorArgs<T extends Entity, F extends object = PaginationFilter<T>> = {
  filter?: F | null;
  first?: number | null;
  after?: string | null;
  last?: number | null;
  before?: string | null;
};

/** Returns a cursor connection shape for a generated query resolver. */
export async function paginateCursor<T extends Entity, F extends object = PaginationFilter<T>>(
  ctx: ContextWithEm,
  type: MaybeAbstractEntityConstructor<T>,
  args: CursorArgs<T, F>,
): Promise<{ edges: { node: T; cursor: string }[]; nodes: T[]; pageInfo: CursorPageInfo<T> }> {
  const limit = args.first ?? args.last ?? defaultLimit;
  const baseFilter = (args.filter ?? {}) as PaginationFilter<T>;
  const filter = withCursorFilter(baseFilter, args);
  const orderBy = { id: args.last ? "DESC" : "ASC" } as FindGqlFilterOptions<T>["orderBy"];
  const nodes = await ctx.em.findGql(type, filter, { limit, orderBy });
  const orderedNodes = args.last ? [...nodes].reverse() : nodes;
  const edges = orderedNodes.map((node) => ({ node, cursor: encodeCursor(String(node.id)) }));
  return {
    edges,
    nodes: orderedNodes,
    pageInfo: new CursorPageInfo(ctx, type, baseFilter, edges),
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
  #type: MaybeAbstractEntityConstructor<T>;

  constructor(
    ctx: ContextWithEm,
    type: MaybeAbstractEntityConstructor<T>,
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
    return (this.#totalCountPromise ??= this.#ctx.em.findCount(this.#type, this.#filter));
  }

  /** Counts rows past a cursor only when the field is requested. */
  async #countPastCursor(direction: "after" | "before", cursor: string | undefined): Promise<boolean> {
    if (!cursor) return false;
    const filter = withCursorFilter(this.#filter, { [direction]: cursor });
    return (await this.#ctx.em.findCount(this.#type, filter)) > 0;
  }
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
