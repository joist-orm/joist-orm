import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Image } from "./entities";

export function newImage(em: EntityManager, opts?: FactoryOpts<Image>): New<Image> {
  return newTestInstance(em, Image, opts);
}
