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
  /** Given a single load hint, partitions it into the sql-able and non-sql-able parts. */
  partitionHint(
    meta: EntityMetadata<any> | undefined,
    hint: LoadHint<any>,
  ): [NestedLoadHint<any> | undefined, NestedLoadHint<any> | undefined];

  /** Given a hint tree for an existing entities going through `em.populate`, loads their relations into the EM's preload cache. */
  preloadPopulate<T extends Entity>(em: EntityManager, meta: EntityMetadata<T>, tree: HintNode<T>): Promise<void>;

  /** Given a hint tree for entities about to be loaded, load the entities, as well as preload-able relations. */
  preloadLoad<T extends Entity>(em: EntityManager, meta: EntityMetadata<T>, tree: HintNode<string>): Promise<T[]>;
}
