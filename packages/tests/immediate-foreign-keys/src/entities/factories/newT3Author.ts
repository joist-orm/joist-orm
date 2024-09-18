import type { DeepNew, FactoryOpts } from "joist-orm";
import { newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { T3Author } from "../entities";

export function newT3Author(em: EntityManager, opts: FactoryOpts<T3Author> = {}): DeepNew<T3Author> {
  return newTestInstance(em, T3Author, opts, {});
}
