import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Author } from "../entities";
import type { EntityManager } from "../entities";

export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): DeepNew<Author> {
  return newTestInstance(em, Author, opts, {});
}
