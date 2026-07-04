import { EntityManager, newPgConnectionConfig } from "joist-core";
import pg from "pg";
import { PostgresDriver } from "./drivers/PostgresDriver.js";

/**
 * Seeds your local/test database with data created via the factories.
 *
 * Unlike `seed` from `joist-test-utils`, this defaults to the `PostgresDriver`, so you can just
 * `import { seed } from "joist-orm/pg"` and pass only your seeding function.
 *
 * This will delete all data in the database, so is restricted to only `local` and `test`
 * `NODE_ENV`s. We also assume the project does not require a context to seed.
 *
 * @example
 * ```ts
 * import { seed } from "joist-orm/pg";
 *
 * seed(async (em) => {
 *   // create your data via factories here
 * });
 * ```
 */
export function seed<E extends EntityManager = EntityManager>(fn: (em: E) => Promise<void>): void {
  const env = process.env.NODE_ENV;
  if (env !== "local" && env !== "test") {
    throw new Error("seed will only run with NODE_ENV=local or NODE_ENV=test because it resets the database");
  }

  const pool = new pg.Pool(newPgConnectionConfig());

  run<E>(pool, fn)
    .then(async () => {
      console.log("Seeded!");
      await pool.end();
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}

/** Flushes the database and runs `fn` against a fresh `EntityManager`. */
async function run<E extends EntityManager>(pool: pg.Pool, fn: (em: E) => Promise<void>): Promise<void> {
  await pool.query("SELECT flush_database()");
  const em = new EntityManager({}, { driver: new PostgresDriver(pool) }) as E;
  await fn(em);
  await em.flush();
}
