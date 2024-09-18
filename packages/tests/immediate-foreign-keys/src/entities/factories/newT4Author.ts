import type { DeepNew, FactoryOpts } from "joist-orm";
import { newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { T4Author } from "../entities";

export function newT4Author(em: EntityManager, opts: FactoryOpts<T4Author> = {}): DeepNew<T4Author> {
  return newTestInstance(em, T4Author, opts, {});
}
