import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { User } from "./entities";
import type { EntityManager } from "./entities";

export function newUser(em: EntityManager, opts: FactoryOpts<User> = {}): DeepNew<User> {
  return newTestInstance(em, User, opts, {});
}
