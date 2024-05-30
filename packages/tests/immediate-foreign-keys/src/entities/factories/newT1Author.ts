import { newTestInstance } from "joist-orm";
import type { DeepNew, FactoryOpts } from "joist-orm";
import { T1Author } from "../entities";
import type { EntityManager } from "../entities";

export function newT1Author(em: EntityManager, opts: FactoryOpts<T1Author> = {}): DeepNew<T1Author> {
  return newTestInstance(em, T1Author, opts, {});
}
