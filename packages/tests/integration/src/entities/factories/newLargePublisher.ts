import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, LargePublisher } from "../entities";

export function newLargePublisher(em: EntityManager, opts: FactoryOpts<LargePublisher> = {}): DeepNew<LargePublisher> {
  return newTestInstance(em, LargePublisher, opts);
}
