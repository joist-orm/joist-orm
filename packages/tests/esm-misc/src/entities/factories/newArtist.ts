import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Artist } from "../entities.ts";
import type { EntityManager } from "../entities.ts";

export function newArtist(em: EntityManager, opts: FactoryOpts<Artist> = {}): DeepNew<Artist> {
  return newTestInstance(em, Artist, opts, {});
}
