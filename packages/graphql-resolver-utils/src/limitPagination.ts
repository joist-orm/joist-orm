import { type Entity, type MaybeAbstractEntityConstructor } from "joist-core";

import {
  type ContextWithEm,
  type PaginationFilter,
  type PaginationQuery,
  countQuery,
  defaultLimit,
  queryEntities,
} from "./paginationUtils.ts";

type LimitArgs<T extends Entity, F extends object = PaginationFilter<T>> = {
  filter?: F | null;
  limit?: number | null;
  offset?: number | null;
};
type Page = { offset: number; limit: number };

/** Returns a limit/offset page shape for a resolver, preserving the entity query's ordering. */
export function paginateLimit<T extends Entity>(
  ctx: ContextWithEm,
  query: PaginationQuery<T>,
  args: Omit<LimitArgs<T>, "filter">,
): Promise<{ entities: T[]; pageInfo: LimitPageInfo<T> }>;
export function paginateLimit<T extends Entity, F extends object = PaginationFilter<T>>(
  ctx: ContextWithEm,
  type: MaybeAbstractEntityConstructor<T>,
  args: LimitArgs<T, F>,
): Promise<{ entities: T[]; pageInfo: LimitPageInfo<T> }>;
export async function paginateLimit<T extends Entity, F extends object = PaginationFilter<T>>(
  ctx: ContextWithEm,
  type: MaybeAbstractEntityConstructor<T> | PaginationQuery<T>,
  args: LimitArgs<T, F>,
): Promise<{ entities: T[]; pageInfo: LimitPageInfo<T> }> {
  const limit = args.limit ?? defaultLimit;
  const offset = args.offset ?? 0;
  const filter = (args.filter ?? {}) as PaginationFilter<T>;
  const entities =
    typeof type === "function"
      ? await ctx.em.findGql(type, filter, { limit, offset })
      : await queryEntities<T>(ctx, { ...type, limit, offset });
  return { entities, pageInfo: new LimitPageInfo(ctx, type, filter, { limit, offset }) };
}

/** Lazily computes limit/offset page fields. */
export class LimitPageInfo<T extends Entity = Entity> {
  #ctx: ContextWithEm;
  #filter: PaginationFilter<T>;
  #page: Page;
  #totalCountPromise: Promise<number> | undefined;
  #type: MaybeAbstractEntityConstructor<T> | PaginationQuery<T>;

  constructor(
    ctx: ContextWithEm,
    type: MaybeAbstractEntityConstructor<T> | PaginationQuery<T>,
    filter: PaginationFilter<T>,
    page: Page,
  ) {
    this.#ctx = ctx;
    this.#type = type;
    this.#filter = filter;
    this.#page = page;
  }

  get hasNextPage(): Promise<boolean> {
    return this.#hasNextPage();
  }

  get hasPreviousPage(): boolean {
    return this.#page.offset > 0;
  }

  get totalCount(): Promise<number> {
    return (this.#totalCountPromise ??=
      typeof this.#type === "function"
        ? this.#ctx.em.findCount(this.#type, this.#filter)
        : countQuery(this.#ctx, this.#type));
  }

  get nextPage(): Promise<number | undefined> {
    return this.#nextPage();
  }

  get currentPage(): number {
    return Math.floor(this.#page.offset / this.#page.limit) + 1;
  }

  /** Returns whether another page exists after this page. */
  async #hasNextPage(): Promise<boolean> {
    const total = await this.totalCount;
    const { offset, limit } = this.#page;
    return offset + limit < total;
  }

  /** Returns the next limit/offset page if there is one. */
  async #nextPage(): Promise<number | undefined> {
    if (!(await this.hasNextPage)) return undefined;
    return this.currentPage + 1;
  }
}
