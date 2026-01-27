import { EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { Author } from "../Author";

export function newAuthor(em: EntityManager, opts?: FactoryOpts<Author>): Author {
  return newTestInstance(em, Author, opts);
}
