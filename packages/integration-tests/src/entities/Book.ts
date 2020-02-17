import { BookCodegen, BookOpts } from "./entities";
import { EntityManager } from "../../../orm/src";

export class Book extends BookCodegen {
  constructor(em: EntityManager, opts: BookOpts) {
    super(em, opts);
  }
}
