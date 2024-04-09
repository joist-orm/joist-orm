import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Painting } from "../entities.js";
import type { EntityManager } from "../entities.js";

export function newPainting(em: EntityManager, opts: FactoryOpts<Painting> = {}): DeepNew<Painting> {
  return newTestInstance(em, Painting, opts, {});
}
