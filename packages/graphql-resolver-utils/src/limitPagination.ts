import { type Entity, type MaybeAbstractEntityConstructor } from "joist-core";
import { type ContextWithEm, defaultLimit, type PaginationFilter } from "./paginationUtils";

type LimitArgs<T extends Entity, F extends object = PaginationFilter<T>> = {
  filter?: F | null;
  limit?: number | null;
  offset?: number | null;
};
type Page = { offset: number; limit: number };

/** Returns a limit/offset page shape for a generated query resolver. */
export async function paginateLimit<T extends Entity, F extends object = PaginationFilter<T>>(
  ctx: ContextWithEm,
  type: MaybeAbstractEntityConstructor<T>,
  args: LimitArgs<T, F>,
): Promise<{ entities: T[]; pageInfo: LimitPageInfo<T> }> {
  const limit = args.limit ?? defaultLimit;
  const offset = args.offset ?? 0;
  const filter = (args.filter ?? {}) as PaginationFilter<T>;
  const entities = await ctx.em.findGql(type, filter, { limit, offset });
  return { entities, pageInfo: new LimitPageInfo(ctx, type, filter, { limit, offset }) };
}

/** Lazily computes limit/offset page fields. */
export class LimitPageInfo<T extends Entity = Entity> {
  #ctx: ContextWithEm;
  #filter: PaginationFilter<T>;
  #page: Page;
  #totalCountPromise: Promise<number> | undefined;
  #type: MaybeAbstractEntityConstructor<T>;

  constructor(ctx: ContextWithEm, type: MaybeAbstractEntityConstructor<T>, filter: PaginationFilter<T>, page: Page) {
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
    return (this.#totalCountPromise ??= this.#ctx.em.findCount(this.#type, this.#filter));
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
