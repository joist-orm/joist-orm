import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { Book } from "./entities";

// for testing factories
export let lastBookFactoryOpts: any = null;

/** @ignore */
export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): DeepNew<Book> {
  lastBookFactoryOpts = opts;
  return newTestInstance(em, Book, opts);
}
