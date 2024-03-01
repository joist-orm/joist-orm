import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { TaskItem } from "./entities";
import type { EntityManager } from "./entities";

export function newTaskItem(em: EntityManager, opts: FactoryOpts<TaskItem> = {}): DeepNew<TaskItem> {
  return newTestInstance(em, TaskItem, opts, {});
}
