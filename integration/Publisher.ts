import { PublisherCodegen, PublisherOpts } from "./entities";
import { EntityManager } from "../src";

export class Publisher extends PublisherCodegen {
  constructor(em: EntityManager, opts: PublisherOpts) {
    super(em, opts);
  }
}
