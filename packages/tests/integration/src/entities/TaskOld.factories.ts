import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { TaskOld } from "./entities";
import type { EntityManager } from "./entities";

export function newTaskOld(em: EntityManager, opts: FactoryOpts<TaskOld> = {}): DeepNew<TaskOld> {
  return newTestInstance(em, TaskOld, opts, {});
}
