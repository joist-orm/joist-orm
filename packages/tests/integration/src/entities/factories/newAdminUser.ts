import { DeepNew, FactoryOpts, newTestInstance } from "joist-orm";
import type { EntityManager } from "../entities";
import { AdminUser } from "../entities";

export function newAdminUser(em: EntityManager, opts: FactoryOpts<AdminUser> = {}): DeepNew<AdminUser> {
  return newTestInstance(em, AdminUser, opts, {});
}
