import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Task } from "./entities";
import type { EntityManager } from "./entities";

export function newTask(em: EntityManager, opts: FactoryOpts<Task> = {}): DeepNew<Task> {
  return newTestInstance(em, Task, opts, {});
}
