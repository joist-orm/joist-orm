import { EntityManager } from "../src";
import { BookCodegen, BookOpts } from "./entities";

export class Book extends BookCodegen {
  constructor(em: EntityManager, opts: BookOpts) {
    super(em, opts);
  }
}
