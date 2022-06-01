import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { EntityManager } from "src/entities";
import { Artist } from "./entities";

export function newArtist(em: EntityManager, opts: FactoryOpts<Artist> = {}): DeepNew<Artist> {
  return newTestInstance(em, Artist, opts);
}
