import { SQL } from "bun";
import { beforeEach, expect } from "bun:test";
import { BunPgDriver } from "joist-driver-bun-pg";
import { toMatchEntity } from "joist-test-utils";
import { EntityManager } from "src/entities/index.ts";

expect.extend({ toMatchEntity });

// Any connections settings...
const sql = new SQL();

export function newEntityManager(): EntityManager {
  const ctx = { sql };
  const em = new EntityManager(ctx as any, {
    driver: new BunPgDriver(sql),
  });
  Object.assign(ctx, { em });
  return em;
}

beforeEach(async () => {
  await sql`select flush_database()`;
});
