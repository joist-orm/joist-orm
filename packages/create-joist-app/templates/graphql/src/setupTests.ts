import { EntityManager, setCurrentlyRunningTest } from "joist-orm";
import { newPgConnectionConfig } from "joist-orm/pg";
import { toMatchEntity } from "joist-orm/tests";
import knex, { Knex } from "knex";
import { entities } from "./entities";

expect.extend({ toMatchEntity });

let db: Knex;
let em: EntityManager;

beforeAll(async () => {
  const config = newPgConnectionConfig();
  db = knex({ client: "pg", connection: config });
});

beforeEach(async () => {
  await db.select(db.raw("flush_database()"));
  em = new EntityManager({ entities, driver: db }, {});
  setCurrentlyRunningTest({ em });
});

afterAll(async () => {
  await db.destroy();
});

export function getEm(): EntityManager {
  return em;
}
