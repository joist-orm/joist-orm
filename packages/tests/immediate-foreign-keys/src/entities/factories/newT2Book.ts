import { newTestInstance } from "joist-orm";
import type { DeepNew, FactoryOpts } from "joist-orm";
import { T2Book } from "../entities";
import type { EntityManager } from "../entities";

export function newT2Book(em: EntityManager, opts: FactoryOpts<T2Book> = {}): DeepNew<T2Book> {
  return newTestInstance(em, T2Book, opts, {});
}
