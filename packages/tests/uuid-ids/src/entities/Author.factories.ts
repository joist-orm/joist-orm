import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Author } from "./entities";

export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): New<Author> {
  return newTestInstance(em, Author, opts);
}
