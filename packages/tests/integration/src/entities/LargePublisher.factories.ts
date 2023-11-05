import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { LargePublisher } from "./entities";

export function newLargePublisher(em: EntityManager, opts: FactoryOpts<LargePublisher> = {}): DeepNew<LargePublisher> {
  return newTestInstance(em, LargePublisher, opts);
}
