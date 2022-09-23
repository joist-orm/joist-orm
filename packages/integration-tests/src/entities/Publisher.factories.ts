import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Publisher } from "./entities";
import type { EntityManager } from "./entities";

/** @ignore */
export function newPublisher(em: EntityManager, opts: FactoryOpts<Publisher> = {}): DeepNew<Publisher> {
  return newTestInstance(em, Publisher, opts);
}
