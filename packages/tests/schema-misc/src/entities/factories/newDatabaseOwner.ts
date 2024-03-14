import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { DatabaseOwner } from "../entities";

export function newDatabaseOwner(em: EntityManager, opts: FactoryOpts<DatabaseOwner> = {}): DeepNew<DatabaseOwner> {
  return newTestInstance(em, DatabaseOwner, opts, {});
}
