import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { AuthorStat } from "./entities";
import type { EntityManager } from "./entities";

/** @ignore */
export function newAuthorStat(em: EntityManager, opts: FactoryOpts<AuthorStat> = {}): DeepNew<AuthorStat> {
  return newTestInstance(em, AuthorStat, opts);
}
