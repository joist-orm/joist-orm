import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T3Author } from "../entities";

export function newT3Author(em: EntityManager, opts: FactoryOpts<T3Author> = {}): DeepNew<T3Author> {
  return newTestInstance(em, T3Author, opts, {});
}
