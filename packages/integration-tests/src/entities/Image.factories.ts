import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Image } from "./entities";
import type { EntityManager } from "./entities";

/** @ignore */
export function newImage(em: EntityManager, opts: FactoryOpts<Image> = {}): DeepNew<Image> {
  return newTestInstance(em, Image, opts);
}
