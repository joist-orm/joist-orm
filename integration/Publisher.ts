import { EntityManager } from "../src";
import { PublisherCodegen, PublisherOpts } from "./entities";

export class Publisher extends PublisherCodegen {
  constructor(em: EntityManager, opts: PublisherOpts) {
    super(em, opts);
  }
}
