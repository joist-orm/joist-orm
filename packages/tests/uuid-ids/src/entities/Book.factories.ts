import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Book } from "./entities";

export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): New<Book> {
  return newTestInstance(em, Book, opts);
}
