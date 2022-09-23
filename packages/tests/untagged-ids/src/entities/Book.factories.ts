import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Book } from "./entities";
import type { EntityManager } from "./entities";

/** @ignore */
export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): DeepNew<Book> {
  return newTestInstance(em, Book, opts);
}
