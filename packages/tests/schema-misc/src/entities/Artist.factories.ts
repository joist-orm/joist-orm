import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Artist } from "./entities";
import type { EntityManager } from "./entities";

/** @ignore */
export function newArtist(em: EntityManager, opts: FactoryOpts<Artist> = {}): DeepNew<Artist> {
  return newTestInstance(em, Artist, opts);
}
