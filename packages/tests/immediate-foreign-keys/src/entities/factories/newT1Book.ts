import type { DeepNew, FactoryOpts } from "joist-orm";
import { newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { T1Book } from "../entities";

export function newT1Book(em: EntityManager, opts: FactoryOpts<T1Book> = {}): DeepNew<T1Book> {
  return newTestInstance(em, T1Book, opts, {});
}
