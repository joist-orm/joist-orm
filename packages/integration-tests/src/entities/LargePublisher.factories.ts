import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { LargePublisher } from "./entities";
import type { EntityManager } from "./entities";

export function newLargePublisher(em: EntityManager, opts: FactoryOpts<LargePublisher> = {}): DeepNew<LargePublisher> {
  return newTestInstance(em, LargePublisher, opts);
}
