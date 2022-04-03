import { FactoryOpts, New, newTestInstance } from "joist-orm";
import { EntityManager } from "src/entities";
import { Book } from "./entities";

export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): New<Book> {
  return newTestInstance(em, Book, opts);
}
