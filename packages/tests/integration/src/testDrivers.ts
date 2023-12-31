import { recordFind, recordQuery } from "@src/testEm";
import { Driver, EntityManager, InMemoryDriver, ParsedFindQuery, PostgresDriver } from "joist-orm";
import { newPgConnectionConfig } from "joist-utils";
import { Knex, knex as createKnex } from "knex";

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
  // The InMemoryDriver does not have a knex instance, but we have some tests
  // that require it and skip themselves if running against the InMemoryDriver
  knex: Knex;
  beforeEach(): Promise<void>;
  destroy(): Promise<void>;
  select(tableName: string): Promise<readonly any[]>;
  insert(tableName: string, row: Record<string, any>): Promise<void>;
  update(tableName: string, row: Record<string, any>): Promise<void>;
  delete(tableName: string, id: number): Promise<void>;
  count(tableName: string): Promise<number>;
}

export class PostgresTestDriver implements TestDriver {
  public driver: Driver;
  public knex: Knex;
  public isInMemory = false;

  constructor() {
    this.knex = createKnex({
      client: "pg",
      connection: newPgConnectionConfig() as any,
      debug: false,
      asyncStackTraces: true,
    }).on("query", (e: any) => {
      recordQuery(e.sql);
    });
    const { knex } = this;
    // Create a subclass that records all `find` calls for tests to assert against
    this.driver = new (class extends PostgresDriver {
      constructor() {
        super(knex);
      }

      async executeFind(
        em: EntityManager,
        parsed: ParsedFindQuery,
        settings: { limit?: number; offset?: number },
      ): Promise<any[]> {
        recordFind(parsed);
        return super.executeFind(em, parsed, settings);
      }
    })();
  }

  async beforeEach() {
    await this.knex.select(this.knex.raw("flush_database()"));
  }

  async destroy() {
    await this.knex.destroy();
  }

  select(tableName: string): Promise<readonly any[]> {
    return this.knex.select("*").from(tableName).orderBy("id");
  }

  async insert(tableName: string, row: Record<string, any>): Promise<void> {
    await this.knex.insert(row).into(tableName);
  }

  async update(tableName: string, row: Record<string, any>): Promise<void> {
    await this.knex(tableName).update(row).where({ id: row.id });
  }

  async delete(tableName: string, id: number): Promise<void> {
    await this.knex(tableName).where("id", 1).del();
  }

  async count(tableName: string): Promise<number> {
    return (await this.knex.select("*").from(tableName)).length;
  }
}

export class InMemoryTestDriver implements TestDriver {
  public driver;
  public knex = null!;
  public isInMemory = true;

  constructor() {
    this.driver = new InMemoryDriver(() => {
      recordQuery("...not implemented for InMemoryDriver");
    });
  }

  async beforeEach() {
    this.driver.clear();
  }

  async destroy() {}

  async select(tableName: string): Promise<readonly any[]> {
    return this.driver.select(tableName);
  }

  async insert(tableName: string, row: Record<string, any>): Promise<void> {
    this.driver.insert(tableName, { ...triggers(), ...row });
  }

  async update(tableName: string, row: Record<string, any>): Promise<void> {
    this.driver.update(tableName, row);
  }

  async delete(tableName: string, id: number): Promise<void> {
    this.driver.delete(tableName, id);
  }

  async count(tableName: string) {
    return this.driver.select(tableName).length;
  }
}

function triggers(): any {
  return { created_at: new Date(), updated_at: new Date() };
}
