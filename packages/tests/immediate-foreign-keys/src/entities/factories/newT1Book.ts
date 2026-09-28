import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { type EntityManager, T1Book } from "../entities";

export function newT1Book(em: EntityManager, opts: FactoryOpts<T1Book> = {}): DeepNew<T1Book> {
  return newTestInstance(em, T1Book, opts, {});
}
