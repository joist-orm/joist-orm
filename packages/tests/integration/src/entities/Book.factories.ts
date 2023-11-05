import { DeepNew, EntityManager, FactoryOpts, maybeNew, newTestInstance, testIndex } from "joist-orm";
import { Author, Book } from "./entities";

// for testing factories
export let lastBookFactoryOpts: any = null;

export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): DeepNew<Book> {
  lastBookFactoryOpts = opts;
  return newTestInstance(em, Book, opts, {
    // Pass a default age so that we can test deep-merging author.age and opts.firstName
    author: maybeNew<Author>({ age: 40 }),
    order: testIndex,
  });
}
