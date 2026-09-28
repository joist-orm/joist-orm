import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T5Book } from "../entities";

export function newT5Book(em: EntityManager, opts: FactoryOpts<T5Book> = {}): DeepNew<T5Book> {
  return newTestInstance(em, T5Book, opts, {});
}
