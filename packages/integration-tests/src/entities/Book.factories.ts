import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Book } from "./entities";

// for testing factories
export let lastBookFactoryOpts: any = null;

export function newBook(em: EntityManager, opts?: FactoryOpts<Book>): New<Book> {
  lastBookFactoryOpts = opts;
  return newTestInstance(em, Book, opts);
}
