import { describe, expect, it, jest } from "@jest/globals";
import { type EntityManager, setRuntimeConfig } from "joist-core";
import { PostgresDriver } from "joist-orm/pg";
import { type Pool } from "pg";

describe("PostgresDriver count-bearing execution", () => {
  it.each(["INSERT INTO books (title) VALUES (?)", "UPDATE books SET title = ?", "DELETE FROM books WHERE title = ?"])(
    "returns the command count without RETURNING: %s",
    async (sql) => {
      // Given PostgreSQL reports three affected books without returning rows
      const { driver, em } = setupDriver(3);

      // When the mutation executes without RETURNING
      const result = await driver.executeQuery(em, sql, ["Imported Book"]);

      // Then its affected count does not come from the empty rows array
      expect(result).toEqual({ rowCount: 3, rows: [] });
    },
  );

  it("accepts a zero command count", async () => {
    // Given PostgreSQL reports no matching books
    const { driver, em } = setupDriver(0);

    // When a delete matches no books
    const result = await driver.executeQuery(em, "DELETE FROM books WHERE id = ?", [1]);

    // Then zero remains a valid count
    expect(result).toEqual({ rowCount: 0, rows: [] });
  });

  it("preserves raw RETURNING rows", async () => {
    // Given PostgreSQL returns the updated book's raw title
    const rows = [{ title: "Imported Book" }];
    // And its command count reports one updated book
    const { driver, em } = setupDriver(1, rows);

    // When the mutation includes RETURNING
    const result = await driver.executeQuery(em, "UPDATE books SET title = ? WHERE id = ? RETURNING title", [
      "Imported Book",
      1,
    ]);

    // Then the driver returns the raw rows without copying or decoding them
    expect(result.rowCount).toBe(1);
    expect(result.rows).toBe(rows);
  });

  it("preserves null counts for commands without a count", async () => {
    // Given PostgreSQL reports no command count for SET CONSTRAINTS
    const { driver, em } = setupDriver(null);

    // When the driver executes the command
    const result = await driver.executeQuery(em, "SET CONSTRAINTS ALL DEFERRED", []);

    // Then the envelope retains the native null count and empty rows
    expect(result).toEqual({ rowCount: null, rows: [] });
  });

  describe("executeQuery transport", () => {
    it.each([false, true])("preserves client routing with an active transaction: %s", async (inTxn) => {
      // Given the pool and transaction client return one selected row
      const { driver, em, pool, client, onQuery } = setupDriver(1, [{ id: 1, active: false }]);
      // And the EntityManager uses either the active transaction or normal autocommit
      em.txn = inTxn ? client : undefined;
      // And the query combines parameter placeholders with PostgreSQL's JSON path operator
      const bindings = [1, "{}"];

      // When the driver executes the query
      await driver.executeQuery(em, "SELECT ?::int AS id, ?::jsonb @? '$.active' AS active", bindings);

      // Then it logs the converted query exactly once without adding transaction commands
      expect(onQuery.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "SELECT $1::int AS id, $2::jsonb @? '$.active' AS active",
          ],
        ]
      `);
      expect((inTxn ? client : pool).query.mock.calls).toEqual([
        ["SELECT $1::int AS id, $2::jsonb @? '$.active' AS active", bindings],
      ]);
      expect((inTxn ? pool : client).query).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
      expect(client.release).not.toHaveBeenCalled();
    });

    it("propagates the original query error", async () => {
      // Given a PostgreSQL query fails before returning command metadata
      const { driver, em, pool } = setupDriver(0);
      // And the pool rejects with the original database error
      const error = new Error("database query failed");
      pool.query.mockRejectedValueOnce(error);

      // When the driver executes the failed query
      const result = driver.executeQuery(em, "SELECT id FROM books", []);

      // Then callers receive that same error
      await expect(result).rejects.toBe(error);
    });
  });
});

/** Provides mock-only query transport without opening database connections or loading entity fixtures. */
function setupDriver(rowCount: unknown, rows: Record<string, unknown>[] = []) {
  setRuntimeConfig({ temporal: false });
  const client = { query: jest.fn(async () => ({ rowCount, rows })), release: jest.fn() };
  const pool = {
    options: {},
    query: jest.fn(async () => ({ rowCount, rows })),
    connect: jest.fn(async () => client),
  };
  const onQuery = jest.fn();
  const driver = new PostgresDriver(pool as unknown as Pool, { onQuery });
  const em = { txn: undefined } as EntityManager;
  return { driver, em, pool, client, onQuery };
}
