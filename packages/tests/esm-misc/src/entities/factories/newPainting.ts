import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Painting } from "../entities.ts";
import type { EntityManager } from "../entities.ts";

export function newPainting(em: EntityManager, opts: FactoryOpts<Painting> = {}): DeepNew<Painting> {
  return newTestInstance(em, Painting, opts, {});
}
