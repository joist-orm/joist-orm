import { newTestInstance } from "joist-orm";
import type { DeepNew, FactoryOpts } from "joist-orm";
import { T5Book } from "../entities";
import type { EntityManager } from "../entities";

export function newT5Book(em: EntityManager, opts: FactoryOpts<T5Book> = {}): DeepNew<T5Book> {
  return newTestInstance(em, T5Book, opts, {});
}
