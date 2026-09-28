import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T2Author } from "../entities";

export function newT2Author(em: EntityManager, opts: FactoryOpts<T2Author> = {}): DeepNew<T2Author> {
  return newTestInstance(em, T2Author, opts, {});
}
