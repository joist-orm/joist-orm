import { Entity } from "../Entity";
import { EntityMetadata } from "../EntityMetadata";
import { ParsedFindQuery } from "../QueryParser";
import { Relation } from "../relations/index";

export interface FindPlugin {
  // Will also need:
  // beforeDelete
  // beforeCreate

  // How should beforeCreate work?
  // Should we call beforeCreate(meta, opts) and see if the opts "match" a slot in the auth rule?
  // Currently, calling `setField` during the entity creation/setOpts handling will fail.
  // So ideally we would bless the entity's location/fields in the graph pre-setOpts.
  // Except is the user really going to have write access to every field?
  // Maybe once em.create detects they are hooking the entity up to a blessed spot in the graph,
  // the user should be allowed to write any fields? Or at least any fields can be set.

  // Also for AsyncMethods/PotentialOperations/Operations
  // beforeInvoke
  // isAllowed

  // Needs to be called from:
  // [done] findDataloader
  // findOrCreateDataloader
  // findCountDataloader
  // findByUniqueDataloader
  // manyToManyFindLoader
  // oneToManyFindLoader

  /**
   * Called before a find query is executed.
   *
   * Plugins are allowed to mutate the `query`, i.e. add additional joins/where clauses.
   *
   * If the plugin returns a `FindCallback`, it will be called after the query is executed,
   * and passed the entities that were found/hydrated by the `query`. This allows the plugin
   * to do any internal bookkeeping it might need to do, i.e. to cascade auth access rules down
   * the graph.
   *
   * (Note: need to think about the "entity existing twice in the AuthRule"...I kind of forget
   * what that means, but in theory it means `FindCallback` might want access to the raw `row`
   * as well as the hydrated entity.)
   */
  beforeFind(meta: EntityMetadata, query: ParsedFindQuery): FindCallback;

  // Should o2m.load call a beforeLoad? Should the oneToManyLoader call to driver.executeFind
  // be considered a "beforeFind" for the purposes of the plugin API? The auth API will want to
  // differentiate "new queries into the graph" vs. "navigations within the graph".
  beforeLoad?(meta: EntityMetadata, entity: Entity, relation: Relation<any, any>): void;
  afterLoad?(meta: EntityMetadata, entity: Entity, relation: Relation<any, any>): void;

  /** Called before a field is read from an entity. */
  beforeGetField?(entity: Entity, fieldName: string): void;

  /** Called before a field is written on an entity. */
  beforeSetField?(entity: Entity, fieldName: string, newValue: unknown): void;
}

export type FindCallback = undefined | ((entities: Entity[]) => void);
