import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T5Author } from "../entities";

export function newT5Author(em: EntityManager, opts: FactoryOpts<T5Author> = {}): DeepNew<T5Author> {
  return newTestInstance(em, T5Author, opts, {});
}
