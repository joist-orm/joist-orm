import { newTestInstance } from "joist-orm";
import type { DeepNew, FactoryOpts } from "joist-orm";
import { T2Author } from "../entities";
import type { EntityManager } from "../entities";

export function newT2Author(em: EntityManager, opts: FactoryOpts<T2Author> = {}): DeepNew<T2Author> {
  return newTestInstance(em, T2Author, opts, {});
}
