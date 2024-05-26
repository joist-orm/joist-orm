import { newTestInstance } from "joist-orm";
import type { DeepNew, FactoryOpts } from "joist-orm";
import { T4Book } from "../entities";
import type { EntityManager } from "../entities";

export function newT4Book(em: EntityManager, opts: FactoryOpts<T4Book> = {}): DeepNew<T4Book> {
  return newTestInstance(em, T4Book, opts, {});
}
