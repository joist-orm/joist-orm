import { FactoryOpts, New, newTestInstance } from "joist-orm";
import { EntityManager } from "src/entities";
import { Author } from "./entities";

export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): New<Author> {
  return newTestInstance(em, Author, opts);
}
