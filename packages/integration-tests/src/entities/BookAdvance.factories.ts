import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { BookAdvance } from "./entities";
import type { EntityManager } from "./entities";

/** @ignore */
export function newBookAdvance(em: EntityManager, opts: FactoryOpts<BookAdvance> = {}): DeepNew<BookAdvance> {
  return newTestInstance(em, BookAdvance, opts);
}
