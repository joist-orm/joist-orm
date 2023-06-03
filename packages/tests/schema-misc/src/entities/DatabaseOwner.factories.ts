import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { DatabaseOwner } from "./entities";
import type { EntityManager } from "./entities";

export function newDatabaseOwner(em: EntityManager, opts: FactoryOpts<DatabaseOwner> = {}): DeepNew<DatabaseOwner> {
  return newTestInstance(em, DatabaseOwner, opts, {});
}
