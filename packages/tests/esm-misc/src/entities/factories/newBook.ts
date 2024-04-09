import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Book } from "../entities.ts";
import type { EntityManager } from "../entities.ts";

export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): DeepNew<Book> {
  return newTestInstance(em, Book, opts, {});
}
