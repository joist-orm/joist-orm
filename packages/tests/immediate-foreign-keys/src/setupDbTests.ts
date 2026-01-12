import { EntityManager } from "@src/entities";
import { PostgresDriver, PostgresDriverOpts } from "joist-orm";
import { toMatchEntity } from "joist-test-utils";
import { newPgConnectionConfig } from "joist-utils";
import postgres from "postgres";

export const sql = postgres({
  ...newPgConnectionConfig(),
  onquery: () => {
    return (q: any) => {
      numberOfQueries++;
      const sql = q.strings.join("?");
      queries.push(sql);
    };
  },
} as any);

export let numberOfQueries = 0;
export let queries: string[] = [];

export function newEntityManager(opts?: PostgresDriverOpts): EntityManager {
  const ctx = { sql };
  const em = new EntityManager(ctx as any, new PostgresDriver(sql, opts));
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

export function select(tableName: string): Promise<readonly any[]> {
  return sql`select * from ${sql(tableName)} order by id`;
}

export function resetQueryCount() {
  numberOfQueries = 0;
  queries = [];
}
