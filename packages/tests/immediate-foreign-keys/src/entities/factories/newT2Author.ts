import type { DeepNew, FactoryOpts } from "joist-orm";
import { newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { T2Author } from "../entities";

export function newT2Author(em: EntityManager, opts: FactoryOpts<T2Author> = {}): DeepNew<T2Author> {
  return newTestInstance(em, T2Author, opts, {});
}
