import type { DeepNew, FactoryOpts } from "joist-orm";
import { newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { T3Book } from "../entities";

export function newT3Book(em: EntityManager, opts: FactoryOpts<T3Book> = {}): DeepNew<T3Book> {
  return newTestInstance(em, T3Book, opts, {});
}
