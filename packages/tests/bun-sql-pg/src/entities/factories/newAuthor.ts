import { type DeepNew, type FactoryOpts, newTestInstance } from "joist-orm";

import { Author, type EntityManager } from "../entities.ts";

export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): DeepNew<Author> {
  return newTestInstance(em, Author, opts, {});
}
