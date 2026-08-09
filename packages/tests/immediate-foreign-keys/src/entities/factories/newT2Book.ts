import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T2Book } from "../entities";

export function newT2Book(em: EntityManager, opts: FactoryOpts<T2Book> = {}): DeepNew<T2Book> {
  return newTestInstance(em, T2Book, opts, {});
}
