import { EntityManager, FactoryOpts, New, newTestInstance, testIndex } from "joist-orm";
import { Author } from "./entities";

// for testing factories
export let lastAuthorFactoryOpts: any = null;

export function newAuthor(em: EntityManager, opts?: FactoryOpts<Author>): New<Author> {
  lastAuthorFactoryOpts = opts;
  return newTestInstance(em, Author, {
    firstName: `a${testIndex}`,
    // example of using opts
    age: opts?.isPopular ? 50 : undefined,
    // Adding to ensure newTestInstance doesn't infinitely recurse between m2os & o2os
    image: undefined,
    ...opts,
  });
}
