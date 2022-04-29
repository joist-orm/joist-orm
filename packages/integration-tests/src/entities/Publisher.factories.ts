import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { Publisher } from "./entities";

export function newPublisher(em: EntityManager, opts: FactoryOpts<Publisher> = {}): DeepNew<Publisher> {
  return newTestInstance(em, Publisher, opts);
}
