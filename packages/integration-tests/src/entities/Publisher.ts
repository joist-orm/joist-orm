import { EntityManager } from "joist-orm";
import { PublisherCodegen, publisherConfig, PublisherOpts } from "./entities";

export class Publisher extends PublisherCodegen {
  constructor(em: EntityManager, opts: PublisherOpts) {
    super(em, opts);
  }
}

publisherConfig.cascadeDelete("authors");
