import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { LargePublisher, Publisher } from "./entities";

export function newPublisher(em: EntityManager, opts: FactoryOpts<Publisher> = {}): DeepNew<Publisher> {
  // Use LargePublisher by default b/c the PublisherType enum already defaulted to large
  return newTestInstance(em, LargePublisher, opts);
}
