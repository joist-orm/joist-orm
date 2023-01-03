import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { Publisher, SmallPublisher } from "./entities";

export function newPublisher(em: EntityManager, opts: FactoryOpts<Publisher> = {}): DeepNew<Publisher> {
  return newTestInstance(em, SmallPublisher, opts);
}
