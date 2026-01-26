import { EntityManager } from "joist-orm";
import { entities } from "./entities";

export interface Context {
  em: EntityManager;
}

export function newContext(em: EntityManager): Context {
  return { em };
}

export async function createEntityManager(): Promise<EntityManager> {
  const { newPgConnectionConfig } = await import("joist-orm/pg");
  const { newEntityManager } = await import("joist-orm");
  const knex = (await import("knex")).default;

  const config = newPgConnectionConfig();
  const driver = knex({ client: "pg", connection: config });

  return newEntityManager({ entities, driver });
}
