import { DeepNew, EntityManager, FactoryOpts, maybeNew, newTestInstance, OptsOf, testIndex } from "joist-orm";
import { Author, Book } from "../entities";

// for testing factories
export let lastBookFactoryOpts: any = null;

type t = OptsOf<Book>;
type a = OptsOf<Author>;
type b = a["age"];
type c = a["firstName"];
type h = FactoryOpts<Author>;
type i = h["age"];

export function newBook(em: EntityManager, opts: FactoryOpts<Book> = {}): DeepNew<Book> {
  lastBookFactoryOpts = opts;
  return newTestInstance(em, Book, opts, {
    // Pass a default age so that we can test deep-merging author.age and opts.firstName
    author: maybeNew<Author>({ age: 40 }),
    sequel: undefined,
    prequel: undefined,
    reviewer: undefined,
    order: testIndex,
  });
}
