import { EntityManager } from "joist-orm";
import { BookCodegen, bookConfig, BookOpts } from "./entities";

export class Book extends BookCodegen {
  constructor(em: EntityManager, opts: BookOpts) {
    super(em, opts);
  }
}

bookConfig.cascadeDelete("reviews");
