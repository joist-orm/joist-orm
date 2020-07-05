import { EntityManager, FactoryOpts, New, newTestInstance, testIndex } from "joist-orm";
import { Author } from "./entities";

export function newAuthor(em: EntityManager, opts?: FactoryOpts<Author>): New<Author> {
  return newTestInstance(em, Author, {
    firstName: `a${testIndex}`,
    // example of using opts
    age: opts?.isPopular ? 50 : undefined,
    ...opts,
  });
}
