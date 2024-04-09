import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { Author } from "../entities.ts";
import type { EntityManager } from "../entities.ts";

export function newAuthor(em: EntityManager, opts: FactoryOpts<Author> = {}): DeepNew<Author> {
  return newTestInstance(em, Author, opts, {});
}
