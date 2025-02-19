import { Context } from "@src/context";
import { EntityManager } from "@src/entities";
import { PostgresDriver, PostgresDriverOpts } from "joist-orm";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import postgres from "postgres";

const sql = postgres({
  ...newPgConnectionConfig(),
  onquery: (e: any) => {
    return (q: any) => {
      numberOfQueries++;
      const sql = q.strings.join("?");
      queries.push(sql);
    };
  },
} as any);

export let numberOfQueries = 0;
export let queries: string[] = [];

export function newEntityManager(opts?: PostgresDriverOpts) {
  const ctx = { sql };
  const em = new EntityManager(ctx as any, new PostgresDriver(sql, { ...opts }));
  Object.assign(ctx, { em });
  return em;
}

expect.extend({ toMatchEntity });

beforeEach(async () => {
  await sql`select flush_database()`;
  resetQueryCount();
});

afterAll(async () => {
  await sql.end();
});

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
}

type itWithCtxFn = (ctx: Context) => Promise<void>;
it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), sql }));
};
