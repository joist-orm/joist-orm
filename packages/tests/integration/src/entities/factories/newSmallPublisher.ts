import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, SmallPublisher } from "../entities";

export function newSmallPublisher(em: EntityManager, opts: FactoryOpts<SmallPublisher> = {}): DeepNew<SmallPublisher> {
  return newTestInstance(em, SmallPublisher, opts);
}
