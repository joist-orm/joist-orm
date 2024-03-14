import { DeepNew, EntityManager, FactoryOpts, newTestInstance } from "joist-orm";
import { Author } from "../entities";

export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): DeepNew<Author> {
  return newTestInstance(em, Author, opts);
}
