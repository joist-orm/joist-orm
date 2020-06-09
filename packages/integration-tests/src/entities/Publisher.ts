import { EntityManager } from "joist-orm";
import { PublisherCodegen, publisherConfig, PublisherOpts } from "./entities";

export class Publisher extends PublisherCodegen {
  constructor(em: EntityManager, opts: PublisherOpts) {
    super(em, opts);
  }
}

publisherConfig.cascadeDelete("authors");

publisherConfig.addRule("authors", (p) => {
  if (p.authors.get.length === 13) {
    return "Cannot have 13 authors";
  }
});
