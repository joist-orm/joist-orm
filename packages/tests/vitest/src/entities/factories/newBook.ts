import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";
import { Book, type EntityManager } from "../entities";

export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): DeepNew<Book> {
  return newTestInstance(em, Book, opts, {});
}
