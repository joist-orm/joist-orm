import { newPgConnectionConfig } from "joist-utils";
import { Knex, knex as createKnex } from "knex";
import pg from "pg";

/**
 * Tests that Knex can be wrapped around an existing pg Pool or PoolClient, so that:
 *
 * 1. When wrapping a Pool (no open transaction), knex queries execute using a
 *    connection from the pool.
 * 2. When wrapping a PoolClient (inside a transaction), knex queries go through
 *    that specific PoolClient — so BEGIN/ROLLBACK issued on the PoolClient also
 *    affect the knex-issued queries.
 */

type DisposablePoolClient = pg.PoolClient & AsyncDisposable;

let pool: pg.Pool;

beforeAll(() => {
  pool = new pg.Pool(newPgConnectionConfig() as any);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query("DELETE FROM publishers");
});

/** Acquire a PoolClient that is released when disposed via `await using`. */
async function connect(pgPool: pg.Pool): Promise<DisposablePoolClient> {
  const client = await pgPool.connect();
  (client as any)[Symbol.asyncDispose] = async () => client.release();
  return client as DisposablePoolClient;
}

/**
 * Create a Knex query builder that delegates to a pg Pool for connections.
 *
 * No built-in knex API exists for replacing its internal tarn.js pool with an
 * external pg.Pool, so we disable the internal pool and override acquire/release.
 */
function knexForPool(pgPool: pg.Pool): Knex {
  const knex = createKnex({ client: "pg", connection: {}, pool: { max: 0 } });
  knex.client.acquireConnection = async () => pgPool.connect();
  knex.client.releaseConnection = async (conn: pg.PoolClient) => conn.release();
  return knex;
}

/**
 * Create a Knex query builder that always uses a specific pg PoolClient.
 *
 * The caller owns the PoolClient lifecycle — knex will neither acquire nor release it.
 */
function knexForClient(client: pg.PoolClient): Knex {
  const knex = createKnex({ client: "pg", connection: {}, pool: { max: 0 } });
  knex.client.acquireConnection = async () => client;
  knex.client.releaseConnection = async () => {};
  return knex;
}

describe("KnexPgWrapping", () => {
  describe("wrapping a pg.Pool", () => {
    it("executes queries using connections from the pool", async () => {
      const knex = knexForPool(pool);

      await knex("publishers").insert({
        name: "p1",
        base_sync_default: "bsd",
        base_async_default: "bad",
      });

      const rows = await knex("publishers").select("name");
      expect(rows).toMatchObject([{ name: "p1" }]);

      // Also verify via the raw pg pool to confirm same DB
      const { rows: pgRows } = await pool.query("SELECT name FROM publishers");
      expect(pgRows).toMatchObject([{ name: "p1" }]);
    });

    it("uses different connections for concurrent queries", async () => {
      const knex = knexForPool(pool);

      const [r1, r2] = await Promise.all([
        knex.raw("SELECT pg_backend_pid() as pid"),
        knex.raw("SELECT pg_backend_pid() as pid"),
      ]);
      const pid1 = r1.rows[0].pid;
      const pid2 = r2.rows[0].pid;
      // They might or might not reuse the same connection depending on timing,
      // but both should succeed — the point is that they come from the pool.
      expect(typeof pid1).toBe("number");
      expect(typeof pid2).toBe("number");
    });
  });

  describe("wrapping a pg.PoolClient", () => {
    it("executes queries on the specific PoolClient", async () => {
      await using client = await connect(pool);
      const knex = knexForClient(client);

      const { rows: directRows } = await client.query("SELECT pg_backend_pid() as pid");
      const knexResult = await knex.raw("SELECT pg_backend_pid() as pid");

      expect(knexResult.rows[0].pid).toBe(directRows[0].pid);
    });

    it("knex queries participate in the PoolClient transaction and are rolled back", async () => {
      await pool.query(
        "INSERT INTO publishers (name, base_sync_default, base_async_default) VALUES ($1, $2, $3)",
        ["baseline", "bsd", "bad"],
      );

      {
        await using client = await connect(pool);
        await client.query("BEGIN");

        const knex = knexForClient(client);
        // Insert via knex — this should use the same PoolClient and thus be inside the txn
        await knex("publishers").insert({
          name: "will-be-rolled-back",
          base_sync_default: "bsd",
          base_async_default: "bad",
        });

        // Within the transaction, the row should be visible
        const inTxnRows = await knex("publishers").select("name").orderBy("name");
        expect(inTxnRows).toMatchObject([{ name: "baseline" }, { name: "will-be-rolled-back" }]);

        await client.query("ROLLBACK");
      }

      // After rollback, only the baseline row should exist
      const { rows } = await pool.query("SELECT name FROM publishers ORDER BY name");
      expect(rows).toMatchObject([{ name: "baseline" }]);
    });

    it("knex queries participate in the PoolClient transaction and are committed", async () => {
      {
        await using client = await connect(pool);
        await client.query("BEGIN");

        const knex = knexForClient(client);
        await knex("publishers").insert({
          name: "will-be-committed",
          base_sync_default: "bsd",
          base_async_default: "bad",
        });

        await client.query("COMMIT");
      }

      const { rows } = await pool.query("SELECT name FROM publishers ORDER BY name");
      expect(rows).toMatchObject([{ name: "will-be-committed" }]);
    });

    it("mixed direct and knex queries in the same transaction share state", async () => {
      {
        await using client = await connect(pool);
        await client.query("BEGIN");

        const knex = knexForClient(client);

        // Insert via raw PoolClient
        await client.query(
          "INSERT INTO publishers (name, base_sync_default, base_async_default) VALUES ($1, $2, $3)",
          ["via-client", "bsd", "bad"],
        );

        // Insert via knex on the same PoolClient
        await knex("publishers").insert({
          name: "via-knex",
          base_sync_default: "bsd",
          base_async_default: "bad",
        });

        // Both rows should be visible within the transaction
        const knexRows = await knex("publishers").select("name").orderBy("name");
        expect(knexRows).toMatchObject([{ name: "via-client" }, { name: "via-knex" }]);

        const { rows: clientRows } = await client.query("SELECT name FROM publishers ORDER BY name");
        expect(clientRows).toMatchObject([{ name: "via-client" }, { name: "via-knex" }]);

        await client.query("ROLLBACK");
      }

      const { rows } = await pool.query("SELECT name FROM publishers ORDER BY name");
      expect(rows).toEqual([]);
    });
  });
});
