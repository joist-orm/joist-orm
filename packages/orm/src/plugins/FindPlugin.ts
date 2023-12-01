import { EntityMetadata } from "../EntityMetadata";
import { ParsedFindQuery } from "../QueryParser";

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

  beforeFind(meta: EntityMetadata, query: ParsedFindQuery): void;
}
