import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Artist } from "../entities.js";
import type { EntityManager } from "../entities.js";

export function newArtist(em: EntityManager, opts: FactoryOpts<Artist> = {}): DeepNew<Artist> {
  return newTestInstance(em, Artist, opts, {});
}
