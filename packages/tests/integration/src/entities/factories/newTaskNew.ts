import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { TaskNew } from "../entities";

export function newTaskNew(em: EntityManager, opts: FactoryOpts<TaskNew> = {}): DeepNew<TaskNew> {
  return newTestInstance(em, TaskNew, opts, {});
}
