import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { SqliteDriver } from "joist-driver-sqlite";
import { EntityManager, kq } from "joist-orm";
import createKnex, { type Knex } from "knex";
import type { TestDriver } from "src/testDrivers";
import { recordQuery } from "src/testEm";

/** Runs the shared integration model against a real SQLite database, isolated per Jest environment. */
export class SqliteTestDriver implements TestDriver {
  readonly driver: SqliteDriver;
  readonly knex: Knex;
  readonly #directory = mkdtempSync(join(tmpdir(), "joist-integration-sqlite-"));
  readonly #db: Database.Database;
  readonly #em: EntityManager;
  readonly #entityTables: string[];

  constructor() {
    const filename = join(this.#directory, "test.db");
    // Fixture creation is not part of the query counts asserted by tests.
    let recordQueries = false;
    this.#db = new Database(filename, {
      timeout: 0,
      verbose: (sql) => {
        if (recordQueries) recordQuery(String(sql));
      },
    });
    this.#db.exec(readFileSync(join(__dirname, "schema.sql"), "utf8"));
    const tables = this.#db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    this.#entityTables = tables
      .filter((table) => {
        const columns = this.#db.prepare(`PRAGMA table_info(${kq(table.name)})`).all() as { name: string }[];
        return !columns.some((column) => column.name === "code");
      })
      .map((table) => table.name);

    recordQueries = true;
    this.driver = new SqliteDriver(this.#db);
    this.#em = new EntityManager({}, this.driver);
    this.knex = createKnex({
      client: "better-sqlite3",
      connection: { filename },
      useNullAsDefault: true,
      pool: {
        min: 0,
        max: 2,
        afterCreate: (
          connection: Database.Database,
          done: (error: Error | null, connection: Database.Database) => void,
        ) => {
          // Fail conflicting writers immediately; waiting blocks the same JS thread that must release the lock.
          connection.pragma("busy_timeout = 0");
          connection.pragma("foreign_keys = ON");
          done(null, connection);
        },
      },
    }).on("query", (event) => recordQuery(event.sql));
  }

  /** Clears entity rows and resets ids while retaining the seeded enum lookup tables. */
  async beforeEach(): Promise<void> {
    this.#db.pragma("foreign_keys = OFF");
    try {
      this.#db.transaction(() => {
        for (const table of this.#entityTables) {
          this.#db.prepare(`DELETE FROM ${kq(table)}`).run();
          // Keep sequence entries: an IdAssigner may already have initialized them in an earlier test.
          this.#db.prepare("UPDATE sqlite_sequence SET seq = 0 WHERE name = ?").run(table);
        }
      })();
    } finally {
      this.#db.pragma("foreign_keys = ON");
    }
  }

  /** Releases both connections before removing this test environment's database. */
  async destroy(): Promise<void> {
    await this.knex.destroy();
    this.#db.close();
    rmSync(this.#directory, { recursive: true });
  }

  /** Reads rows using the ORM driver's scalar decoding, just like PostgreSQL's native parsers. */
  async select(tableName: string): Promise<readonly unknown[]> {
    return (await this.driver.executeQuery(this.#em, `SELECT * FROM ${kq(tableName)} ORDER BY id`, [])).rows;
  }

  /** Inserts fixture rows, letting AUTOINCREMENT account for manually supplied ids. */
  async insert(tableName: string, row: Record<string, unknown>): Promise<void> {
    await this.knex(tableName).insert(sqliteRow(row));
  }

  /** Updates fixture rows using the same SQLite bindings as inserts. */
  async update(tableName: string, row: Record<string, unknown>): Promise<void> {
    await this.knex(tableName).update(sqliteRow(row)).where({ id: row.id });
  }

  /** Removes a fixture row by its physical id. */
  async delete(tableName: string, id: number): Promise<void> {
    await this.knex(tableName).where({ id }).delete();
  }

  /** Counts physical rows without loading entities. */
  async count(tableName: string): Promise<number> {
    const row = this.#db.prepare(`SELECT count(*) AS count FROM ${kq(tableName)}`).get() as { count: number };
    return row.count;
  }
}

/** Encodes fixture values because Knex's SQLite bindings do not use PostgreSQL's native type parsers. */
function sqliteRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString()
        : typeof value === "boolean"
          ? Number(value)
          : value !== null && typeof value === "object" && !Buffer.isBuffer(value)
            ? JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item))
            : value,
    ]),
  );
}
