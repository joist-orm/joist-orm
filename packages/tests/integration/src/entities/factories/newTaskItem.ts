import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { TaskItem } from "../entities";

export function newTaskItem(em: EntityManager, opts: FactoryOpts<TaskItem> = {}): DeepNew<TaskItem> {
  return newTestInstance(em, TaskItem, opts, {});
}
