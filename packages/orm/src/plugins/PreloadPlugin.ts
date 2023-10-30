import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { HintNode } from "../HintTree";
import { LoadHint, NestedLoadHint } from "../loadHints";

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

  /**
   * Given a hint tree for an existing entities going through `em.populate`, loads their relations
   * into the EM's preload cache.
   *
   * The `EntityManager.populate` method will still call each relation's `.preload()` method, to
   * pull the data from the preload cache into the relation.
   */
  preloadPopulate<T extends Entity>(em: EntityManager, meta: EntityMetadata<T>, tree: HintNode<T>): Promise<void>;

  /**
   * Given a hint tree for entities about be loaded from the database, load the entities, as well as preload-able
   * relations.
   *
   * The `EntityManager.load` methods will still call `em.populate`, which will call each relation's
   * `.preload()` method, to pull the data from the preload cache into the relation.
   *
   * Note that, unlike `preloadPopulate`, `tree` will have both sql-able and non-sql-able hints, so the
   * implementation should just ignore any hints that it's not able to preload.
   */
  preloadLoad<T extends Entity>(em: EntityManager, meta: EntityMetadata<T>, tree: HintNode<string>): Promise<T[]>;
}
