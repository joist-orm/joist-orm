import { PublisherCodegen, PublisherOpts } from "./entities";
import { EntityManager } from "../../../orm/src";

export class Publisher extends PublisherCodegen {
  constructor(em: EntityManager, opts: PublisherOpts) {
    super(em, opts);
  }
}
