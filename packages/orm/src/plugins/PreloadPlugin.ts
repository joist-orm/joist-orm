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
    meta: EntityMetadata | undefined,
    hint: LoadHint<any>,
  ): [NestedLoadHint<any> | undefined, NestedLoadHint<any> | undefined];

  /**
   * Given an existing `ParsedFindQuery`, adds extra selects & joins directly
   * to the `query` that will preload any child data requested in `tree`.
   *
   * The caller is still responsible for executing `query`, and then also
   * calling the `PreloadHydrator` with the database results for the preload
   * plugin to instantiate & populate the EM's preload cache.
   *
   * Note that the actual relations themselves won't be loaded, just the preload
   * cache populated to make the relation `.preload()` / `.load()` fast.
   */
  addPreloading(
    em: EntityManager,
    meta: EntityMetadata,
    tree: HintNode<EntityOrId>,
    query: ParsedFindQuery,
  ): PreloadHydrator | undefined;

  /**
   * Given an anticipated `ParsedFindQuery`, returns lower-level `JoinResult` that
   * are the fragments of SELECTs and JOINs that the caller can work into their custom
   * query.
   *
   * This is primarily for callers who aren't going to call `driver.executeFind`, but instead
   * are crafting their own SQL query for `driver.executeQuery` (basically this is `em.findAll`
   * because it uses a complicated CTE + join strategy to do batching).
   */
  getPreloadJoins(
    em: EntityManager,
    meta: EntityMetadata,
    tree: HintNode<EntityOrId>,
    query: ParsedFindQuery,
  ): JoinResult[];
}

/**
 * Given a list of `rows`, and the already-hydrated `entities` for each row, reads the preload-specific
 * columns out of the `rows` result set, and pushes them into the EM preload cache, hydrating
 * the child entities in the process, but not marking any relations as loaded.
 *
 * The order of `rows` and `entities` must match.
 */
export type PreloadHydrator = (rows: any[], entities: any[]) => void;

/** A preload-loadable join for a given child, with potentially grand-child joins contained within it. */
export type JoinResult = {
  /** The select clause(s) for this join, i.e. `b._ as _b` or `c._ as _c`. */
  selects: { value: string; as: string }[];
  /** The SQL for this child's lateral join, which itself might have recursive lateral joins. */
  join: string;
  /** The processor for this child's lateral join, which itself might recursively processor subjoins. */
  hydrator: PreloadHydrator;
  /** Any bindings for filtering subjoins by a subset of the root entities, to avoid over-fetching. */
  bindings: any[];
};
