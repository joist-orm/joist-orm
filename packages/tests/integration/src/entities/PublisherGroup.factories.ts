import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { EntityManager, PublisherGroup, newAuthor } from "./entities";

export function newPublisherGroup(
  em: EntityManager,
  opts: FactoryOpts<PublisherGroup> & { withSideEffectAuthor?: boolean } = {},
): DeepNew<PublisherGroup> {
  const { withSideEffectAuthor, ...testOpts } = opts;
  const pg = newTestInstance(em, PublisherGroup, testOpts, { name: "name" });
  // This mimics some code we had internally, that was creating extra entities
  // outside the factory chain, so they were not being tracked by the factory.
  if (withSideEffectAuthor) {
    newAuthor(em);
  }
  return pg;
}
