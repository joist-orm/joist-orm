import "dotenv/config";
import { Driver, EntityManager, newPgConnectionConfig } from "joist-core";
import { knex as createKnex } from "knex";
import pg from "pg";

export interface SeedConfig {
  /** A factory function to create a Driver from a pg Pool. */
  createDriver: (pool: pg.Pool) => Driver;
}

/**
 * Allows easily seeding your local database with test data from the factories.
 *
 * This will delete all data in the database, so is restricted to only `local` and
 * `test` `NODE_ENV`s.
 *
 * We currently make a lot of assumptions:
 *
 * - That the project is using postgres (all Joist projects do atm)
 * - That the project does not have a context, or at least does not require a context to seed
 *
 * If any of these assumptions are not true, you can copy this code into your project.
 *
 * @example
 * ```ts
 * import { seed } from "joist-test-utils";
 * import { PostgresDriver } from "joist-orm";
 *
 * seed({ createDriver: (pool) => new PostgresDriver(pool) }, async (em) => {
 *   // seed your data here
 * });
 * ```
 */
export function seed<E extends EntityManager = EntityManager>(config: SeedConfig, fn: (em: E) => Promise<void>): void {
  const env = process.env.NODE_ENV;
  if (env !== "local" && env !== "test") {
    throw new Error("seed will only run with NODE_ENV=local or NODE_ENV=test because it resets the database");
  }

  const connectionConfig = newPgConnectionConfig();
  const pool = new pg.Pool(connectionConfig as any);
  // Knex is still used for flush_database() since it's a convenient utility
  const knex = createKnex({ client: "pg", connection: connectionConfig });

  async function seed() {
    await knex.select(knex.raw("flush_database()"));
    const driver = config.createDriver(pool);
    const em = new EntityManager({}, { driver }) as E;
    await fn(em);
    await em.flush();
  }

  seed()
    .then(async () => {
      console.log("Seeded!");
      await pool.end();
      await knex.destroy();
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      await knex.destroy();
      process.exit(1);
    });
}
