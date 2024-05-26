import { newTestInstance } from "joist-orm";
import type { DeepNew, FactoryOpts } from "joist-orm";
import { T5Author } from "../entities";
import type { EntityManager } from "../entities";

export function newT5Author(em: EntityManager, opts: FactoryOpts<T5Author> = {}): DeepNew<T5Author> {
  return newTestInstance(em, T5Author, opts, {});
}
