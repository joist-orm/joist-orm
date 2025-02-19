import { Context } from "@src/context";
import { EntityManager } from "@src/entities";
import { PostgresDriver, PostgresDriverOpts, TestUuidAssigner } from "joist-orm";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import postgres from "postgres";

export const sql = postgres(newPgConnectionConfig());

const testUuidAssigner = new TestUuidAssigner();

beforeEach(() => testUuidAssigner.reset());

export function newEntityManager(opts?: PostgresDriverOpts) {
  const ctx = { sql };
  const em = new EntityManager(ctx as any, new PostgresDriver(sql, { idAssigner: testUuidAssigner, ...opts }));
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

export async function insert(tableName: string, row: Record<string, any>): Promise<void> {
  await sql`INSERT INTO ${sql(tableName)} ${sql(row, Object.keys(row))}`;
}

type itWithCtxFn = (ctx: Context) => Promise<void>;
it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), sql }));
};
