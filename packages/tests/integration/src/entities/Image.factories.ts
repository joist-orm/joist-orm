import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { Image } from "./entities";

export function newImage(em: EntityManager, opts?: FactoryOpts<Image>): DeepNew<Image> {
  return newTestInstance(em, Image, opts);
}
