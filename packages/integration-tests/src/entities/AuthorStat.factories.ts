import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { EntityManager } from "src/entities";
import { AuthorStat } from "./entities";

export function newAuthorStat(em: EntityManager, opts: FactoryOpts<AuthorStat> = {}): DeepNew<AuthorStat> {
  return newTestInstance(em, AuthorStat, opts);
}
