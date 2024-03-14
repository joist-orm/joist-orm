import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { TaskNew } from "../entities";
import type { EntityManager } from "../entities";

export function newTaskNew(em: EntityManager, opts: FactoryOpts<TaskNew> = {}): DeepNew<TaskNew> {
  return newTestInstance(em, TaskNew, opts, {});
}
