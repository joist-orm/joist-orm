import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { EntityManager } from "src/entities";
import { Painting } from "./entities";

export function newPainting(em: EntityManager, opts: FactoryOpts<Painting> = {}): DeepNew<Painting> {
  return newTestInstance(em, Painting, opts);
}
