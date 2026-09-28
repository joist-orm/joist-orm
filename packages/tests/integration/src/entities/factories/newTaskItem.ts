import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, TaskItem } from "../entities";

export function newTaskItem(em: EntityManager, opts: FactoryOpts<TaskItem> = {}): DeepNew<TaskItem> {
  return newTestInstance(em, TaskItem, opts, {});
}
