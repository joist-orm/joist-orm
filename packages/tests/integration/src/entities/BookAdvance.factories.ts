import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { BookAdvance } from "./entities";

export function newBookAdvance(em: EntityManager, opts?: FactoryOpts<BookAdvance>): DeepNew<BookAdvance> {
  return newTestInstance(em, BookAdvance, opts);
}
