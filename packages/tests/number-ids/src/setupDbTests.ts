import { Context } from "@src/context";
import { EntityManager } from "@src/entities";
import { PostgresDriver, PostgresDriverOpts } from "joist-orm";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import postgres from "postgres";

export const sql = postgres(newPgConnectionConfig());

export function newEntityManager(opts?: PostgresDriverOpts): EntityManager {
  const ctx = { sql };
  const em = new EntityManager(ctx as any, new PostgresDriver(sql, opts));
  Object.assign(ctx, { em });
  return em;
}

expect.extend({ toMatchEntity });

beforeEach(async () => {
  await sql`select flush_database()`;
});

afterAll(async () => {
  await sql.end();
});

export function select(tableName: string): Promise<readonly any[]> {
  return sql`select * from ${sql(tableName)} order by id`;
}

type itWithCtxFn = (ctx: Context) => Promise<void>;
it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), sql }));
};
