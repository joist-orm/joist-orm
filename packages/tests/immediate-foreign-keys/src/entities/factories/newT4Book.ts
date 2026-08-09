import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T4Book } from "../entities";

export function newT4Book(em: EntityManager, opts: FactoryOpts<T4Book> = {}): DeepNew<T4Book> {
  return newTestInstance(em, T4Book, opts, {});
}
