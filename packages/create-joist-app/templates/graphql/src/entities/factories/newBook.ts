import { EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { Book } from "../Book";

export function newBook(em: EntityManager, opts?: FactoryOpts<Book>): Book {
  return newTestInstance(em, Book, opts);
}
