import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { Book } from "./entities";

// for testing factories
export let lastBookFactoryOpts: any = null;

export function newBook(em: EntityManager, opts?: FactoryOpts<Book>): DeepNew<Book> {
  lastBookFactoryOpts = opts;
  return newTestInstance(em, Book, opts);
}
