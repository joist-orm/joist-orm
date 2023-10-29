import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { HintNode } from "../HintTree";
import { LoadHint, NestedLoadHint } from "../loadHints";

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
