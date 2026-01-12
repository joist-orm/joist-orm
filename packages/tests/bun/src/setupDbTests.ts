import { afterAll, beforeEach, expect } from "bun:test";
import { newPgConnectionConfig, PostgresDriver } from "joist-orm";
import { toMatchEntity } from "joist-test-utils";
import postgres from "postgres";
import { EntityManager } from "src/entities";

expect.extend({ toMatchEntity });

export let sql = postgres(newPgConnectionConfig());

export function newEntityManager(): EntityManager {
  const ctx = { sql };
  const em = new EntityManager(ctx as any, {
    driver: new PostgresDriver(sql),
  });
  Object.assign(ctx, { em });
  return em;
}

beforeEach(async () => {
  await sql`select flush_database()`;
});

afterAll(async () => {
  // This runs once per test file, so we cannot destroy or it will break everything after the
  // first test. Oddly enough the process still seems to shutdown cleanly.
  // await sql.end();
});
