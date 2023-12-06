import { Entity } from "../Entity";
import { EntityMetadata } from "../EntityMetadata";
import { ParsedFindQuery } from "../QueryParser";
import { Relation } from "../relations/index";

export interface FindPlugin {
  // Will also need:
  // beforeDelete
  // beforeCreate
  // setField
  // getField
  // --> beforeFind might return a callback that says "here are the entities
  // that you found", so that we could seed our getField/setField caches by
  // knowing which explicit node they were loaded from. ...if an entity exists
  // twice in the AuthRule, the callback might need the raw `row` as well, to
  // integrate which AuthRule the entity came from.

  // Also for AsyncMethods/PotentialOperations/Operations
  // beforeInvoke
  // isAllowed

  // Needs to be called from:
  // findDataloader
  // findOrCreateDataloader
  // findCountDataloader
  // findByUniqueDataloader
  // manyToManyFindLoader
  // oneToManyFindLoader
  beforeFind(meta: EntityMetadata, query: ParsedFindQuery): FindCallback;

  // Should o2m.load call a beforeLoad? Should the oneToManyLoader call to driver.executeFind
  // be considered a "beforeFind" for the purposes of the plugin API? The auth API will want to
  // differentiate "new queries into the graph" vs. "navigations within the graph".
  beforeLoad?(meta: EntityMetadata, entity: Entity, relation: Relation<any, any>): void;
  afterLoad?(meta: EntityMetadata, entity: Entity, relation: Relation<any, any>): void;

  beforeGetField?(entity: Entity, fieldName: string): void;
  beforeSetField?(entity: Entity, fieldName: string, newValue: unknown): void;
}

export type FindCallback = undefined | ((entities: Entity[]) => void);
