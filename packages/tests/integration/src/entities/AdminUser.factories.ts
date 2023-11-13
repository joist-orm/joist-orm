import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import { AdminUser } from "./entities";
import type { EntityManager } from "./entities";

export function newAdminUser(em: EntityManager, opts: FactoryOpts<AdminUser> = {}): DeepNew<AdminUser> {
  return newTestInstance(em, AdminUser, opts, {});
}
