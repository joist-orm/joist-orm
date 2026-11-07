import { PostgresDriver } from "joist-orm/pg";
import pg from "pg";

describe("PostgresDriver.pipeline", () => {
  it("enables pipelining for consumer pools", async () => {
    // Given a consumer pool that has not enabled pipelining
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? "postgres://joist:local@localhost:5435/joist",
    });
    try {
      // When the consumer creates a PostgreSQL driver
      new PostgresDriver(pool);

      // Then the pool enables pipelining
      expect(pool.options.pipeline).toBe(true);

      // When the pool acquires a connection
      const client = await pool.connect();
      try {
        // Then the connection also enables pipelining
        expect(client.pipeline).toBe(true);
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });
});
