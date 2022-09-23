import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Painting } from "./entities";
import type { EntityManager } from "./entities";

/** @ignore */
export function newPainting(em: EntityManager, opts: FactoryOpts<Painting> = {}): DeepNew<Painting> {
  return newTestInstance(em, Painting, opts);
}
