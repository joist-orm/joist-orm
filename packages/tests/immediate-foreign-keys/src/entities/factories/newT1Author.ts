import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T1Author } from "../entities";

export function newT1Author(em: EntityManager, opts: FactoryOpts<T1Author> = {}): DeepNew<T1Author> {
  return newTestInstance(em, T1Author, opts, {});
}
