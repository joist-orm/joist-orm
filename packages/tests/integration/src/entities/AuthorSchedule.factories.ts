import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "./entities";
import { AuthorSchedule } from "./entities";

export function newAuthorSchedule(em: EntityManager, opts: FactoryOpts<AuthorSchedule> = {}): DeepNew<AuthorSchedule> {
  return newTestInstance(em, AuthorSchedule, opts, {});
}
