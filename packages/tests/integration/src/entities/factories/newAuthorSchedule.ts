import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";

import { AuthorSchedule, type EntityManager } from "../entities";

export function newAuthorSchedule(em: EntityManager, opts: FactoryOpts<AuthorSchedule> = {}): DeepNew<AuthorSchedule> {
  return newTestInstance(em, AuthorSchedule, opts, {});
}
