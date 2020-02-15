import { AuthorCodegen, AuthorOpts } from "./entities";
import { EntityManager } from "../src";

export class Author extends AuthorCodegen {
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
  }
}
