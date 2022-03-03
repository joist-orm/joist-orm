import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Publisher } from "./entities";

export function newPublisher(em: EntityManager, opts: FactoryOpts<Publisher> = {}): New<Publisher> {
  return newTestInstance(em, Publisher, opts);
}
