import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, TaskThird } from "../entities";

export function newTaskThird(em: EntityManager, opts: FactoryOpts<TaskThird> = {}): DeepNew<TaskThird> {
  return newTestInstance(em, TaskThird, opts, {});
}
