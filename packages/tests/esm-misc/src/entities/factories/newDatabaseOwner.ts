import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { DatabaseOwner } from "../entities.js";
import type { EntityManager } from "../entities.js";

export function newDatabaseOwner(em: EntityManager, opts: FactoryOpts<DatabaseOwner> = {}): DeepNew<DatabaseOwner> {
  return newTestInstance(em, DatabaseOwner, opts, {});
}
