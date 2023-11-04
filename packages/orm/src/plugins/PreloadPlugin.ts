import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { EntityOrId, HintNode } from "../HintTree";
import { LoadHint, NestedLoadHint } from "../loadHints";
import { ParsedFindQuery } from "../QueryParser";

/**
 * This is a plugin API dedicated to preloading data for subtrees of entities.
 *
 * I.e. when evaluating `em.load(Author, "a:1", { books: "reviews" })`, loading both the
 * Author `a:1` plus all the author's books, and all the author's books' reviews, in a single
 * SQL call.
 *
 * Implementations of this API should execute the SQL queries necessary to load the data, and
 * then store the preloaded data in the `EntityManager.preloadedRelations` cache, which the
 * `OneToManyCollection`, `ManyToOneReference`, etc. relation implementations check before
 * issuing their own `.load()` SQL calls.
 */
export interface PreloadPlugin {
  /**
   * Given a single load hint, partitions it into the sql-able and non-sql-able parts.
   *
   * The sql-able hints will later be passed to `preloadPopulate` to fetch as a single
   * SQL call.
   */
  partitionHint(
    meta: EntityMetadata<any> | undefined,
    hint: LoadHint<any>,
  ): [NestedLoadHint<any> | undefined, NestedLoadHint<any> | undefined];

  addPreloading<T extends Entity>(
    em: EntityManager,
    meta: EntityMetadata<T>,
    tree: HintNode<EntityOrId>,
    query: ParsedFindQuery,
  ): PreloadProcessor | undefined;

  getPreloadJoins<T extends Entity>(
    em: EntityManager,
    meta: EntityMetadata<T>,
    tree: HintNode<T>,
    query: ParsedFindQuery,
  ): JoinResult[];
}

export type PreloadProcessor = (rows: any[], entities: any[]) => void;

/** A preload-loadable join for a given child, with potentially grand-child joins contained within it. */
export type JoinResult = {
  /** The select clause(s) for this join, i.e. `b._ as _b` or `c._ as _c`. */
  selects: { value: string; as: string }[];
  /** The alias for this child's single json-array-d column, i.e. `b._` or `c._`. */
  alias: string;
  /** The SQL for this child's lateral join, which itself might have recursive lateral joins. */
  join: string;
  /** The processor for this child's lateral join, which itself might recursively processor subjoins. */
  processor: PreloadProcessor;
  /** Any bindings for filtering subjoins by a subset of the root entities, to avoid over-fetching. */
  bindings: any[];
};
