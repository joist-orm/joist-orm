import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { BookAdvance } from "./entities";

export function newBookAdvance(em: EntityManager, opts?: FactoryOpts<BookAdvance>): New<BookAdvance> {
  return newTestInstance(em, BookAdvance, opts);
}
