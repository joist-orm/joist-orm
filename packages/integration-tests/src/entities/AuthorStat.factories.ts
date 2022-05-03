import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { AuthorStat, EntityManager } from "src/entities";

export function newAuthorStat(em: EntityManager, opts: FactoryOpts<AuthorStat> = {}): DeepNew<AuthorStat> {
  return newTestInstance(em, AuthorStat, opts);
}
