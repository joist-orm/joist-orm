import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { TaskOld } from "../entities";

export function newTaskOld(em: EntityManager, opts: FactoryOpts<TaskOld> = {}): DeepNew<TaskOld> {
  return newTestInstance(em, TaskOld, opts, {});
}
