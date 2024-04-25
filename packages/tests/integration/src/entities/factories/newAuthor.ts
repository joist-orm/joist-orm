import { DeepNew, EntityManager, FactoryOpts, newTestInstance, testIndex } from "joist-orm";
import { Author } from "../entities";

// for testing factories
export let lastAuthorFactoryOpts: any = null;

export function newAuthor(
  em: EntityManager,
  opts: FactoryOpts<Author> & { canHaveReviews?: boolean } = {},
): DeepNew<Author> {
  lastAuthorFactoryOpts = opts;
  const { canHaveReviews, ...rest } = opts;
  return newTestInstance(em, Author, rest, {
    firstName: `a${testIndex}`,
    // example of using opts, and also used as an example of ignoring opts
    age: opts.isPopular ? 50 : undefined,
    // Adding to ensure newTestInstance doesn't infinitely recurse between m2os & o2os
    image: undefined,
    ...(canHaveReviews ? { graduated: new Date(), age: 21 } : {}),
  });
}
