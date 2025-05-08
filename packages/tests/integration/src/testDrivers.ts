import { recordQuery } from "@src/testEm";
import { Driver, PostgresDriver } from "joist-orm";
import { JsonAggregatePreloader } from "joist-plugin-join-preloading";
import { newPgConnectionConfig } from "joist-utils";
import postgres, { Sql } from "postgres";

/**
 * Small abstraction to create a given driver for testing.
 *
 * Note this abstraction only exists for testing Joist itself; downstream applications
 * should not copy this approach / it should not be necessary, as they can rely on the
 * Joist factories directly.
 */
export interface TestDriver {
  driver: Driver;
  isInMemory: boolean;
  // The InMemoryDriver does not have a sql instance, but we have some tests
  // that require it and skip themselves if running against the InMemoryDriver
  sql: Sql;
  beforeEach(): Promise<void>;
  destroy(): Promise<void>;
  select(tableName: string): Promise<readonly any[]>;
  insert(tableName: string, row: Record<string, any>, subclassTable?: boolean): Promise<void>;
  update(tableName: string, row: Record<string, any>): Promise<void>;
  delete(tableName: string, id: number): Promise<void>;
  count(tableName: string): Promise<number>;
}

export class PostgresTestDriver implements TestDriver {
  public driver: Driver;
  public sql: Sql;
  public isInMemory = false;

  constructor(isPreloadingEnabled: boolean) {
    this.sql = postgres({
      // transform: { undefined: null },
      ...newPgConnectionConfig(),
      types: {
        // why did we need this?
        // jsonb: {
        //   to: builtins.JSONB,
        //   from: [builtins.JSONB],
        //   serialize: (s: any) => JSON.stringify(s),
        //   parse: (s: any) => JSON.parse(s),
        // },
        // jsonb[] were serialized as `{{1,2},{3,4}}` but we need `{"[1,2]","[3,4]"}`
        _jsonb: {
          to: 3807,
          from: [3807],
          serialize: (s: any) =>
            `{${(s as any[]).map((s) => `"${JSON.stringify(s).replace(/"/g, '\\"')}"`).join(",")}}`,
          parse: (s: any) => {
            throw new Error("Not implemented");
          },
        },
      },
      // debug: true,
      onquery: () => {
        // queued
        return (q: any) => {
          // sent
          recordQuery(
            q.query ?? // q might be a PostgresError
              q.statement?.string,
          );
          return () => {
            // finished
          };
        };
      },
    } as any);
    const preloadPlugin = isPreloadingEnabled ? new JsonAggregatePreloader() : undefined;
    this.driver = new PostgresDriver(this.sql, { preloadPlugin });
  }

  async beforeEach() {
    await this.sql`select flush_database()`;
  }

  async destroy() {
    await this.sql.end();
  }

  select(tableName: string): Promise<readonly any[]> {
    return this.sql`select * from ${this.sql(tableName)} order by id`;
  }

  async insert(tableName: string, row: Record<string, any>, subclassTable = false): Promise<void> {
    if (row.id && !subclassTable) {
      // Manually specifying ids can help test readability, but ensure the sequence is updated,
      // particularly if we're using the "only delete from touched sequences" flush_database.
      await this.sql`SELECT setval('${this.sql(`${tableName}_id_seq`)}', ${row.id}, true)`;
    }
    await this.sql`insert into ${this.sql(tableName)} ${this.sql(row)}`;
  }

  async update(tableName: string, row: Record<string, any>): Promise<void> {
    const columns = Object.keys(row).filter((k) => k !== "id");
    await this.sql`update ${this.sql(tableName)} set ${this.sql(row, columns)} where id = ${row.id}`;
  }

  async delete(tableName: string, id: number): Promise<void> {
    await this.sql`delete from ${this.sql(tableName)} where id = ${id}`;
  }

  async count(tableName: string): Promise<number> {
    return Number((await this.sql`select count(*) as count from ${this.sql(tableName)}`)[0].count);
  }
}
