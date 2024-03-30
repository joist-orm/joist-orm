import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { Task } from "../entities";

export function newTask(em: EntityManager, opts: FactoryOpts<Task> = {}): DeepNew<Task> {
  return newTestInstance(em, Task, opts, {});
}
