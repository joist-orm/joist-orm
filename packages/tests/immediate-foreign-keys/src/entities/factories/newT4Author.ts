import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T4Author } from "../entities";

export function newT4Author(em: EntityManager, opts: FactoryOpts<T4Author> = {}): DeepNew<T4Author> {
  return newTestInstance(em, T4Author, opts, {});
}
