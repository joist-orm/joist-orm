import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { Task, TaskOld } from "../entities";

export function newTask(em: EntityManager, opts: FactoryOpts<Task> = {}): DeepNew<Task> {
  // Create a TaskOld by default
  return newTestInstance(em, TaskOld, opts, {});
}
