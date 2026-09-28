import { createKnex } from "joist-orm/knex";
import { PostgresDriver, type PostgresDriverOpts } from "joist-orm/pg";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import { type Knex } from "knex";
import pg from "pg";
import { type Context } from "src/context";
import { EntityManager } from "src/entities";

export let knex: Knex;
let pool: pg.Pool;

export function newEntityManager(opts?: PostgresDriverOpts): EntityManager {
  const ctx = { knex } as Context;
  const em = new EntityManager(ctx, new PostgresDriver(pool, opts));
  Object.assign(ctx, { em });
  return em;
}

expect.extend({ toMatchEntity });

beforeAll(async () => {
  pool = new pg.Pool(newPgConnectionConfig());
  knex = createKnex(pool);
});

beforeEach(async () => {
  await knex.select(knex.raw("flush_database()"));
});

afterAll(async () => {
  await pool.end();
});

export function select(tableName: string): Promise<readonly unknown[]> {
  return knex.select("*").from(tableName).orderBy("id");
}
