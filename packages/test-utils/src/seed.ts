import "dotenv/config";
import { EntityManager, newPgConnectionConfig, PostgresDriver } from "joist-orm";
import postgres from "postgres";

/**
 * Allows easily seeding your local database with test data from the factories.
 *
 * This will delete all data in the database, so is restricted to only `local` and
 * `test` `NODE_ENV`s.
 *
 * We currently make a lot of assumptions:
 *
 * - That the project is using knex (all Joist projects do atm)
 * - That the project is using postgres (all Joist projects do atm)
 * - That the project does not have a context, or at least does not require a context to seed
 *
 * If any of these assumptions are not true, you can copy this code into your project.
 */
export function seed<E extends EntityManager = EntityManager>(fn: (em: E) => Promise<void>): void {
  const env = process.env.NODE_ENV;
  if (env !== "local" && env !== "test") {
    throw new Error("seed will only run with NODE_ENV=local or NODE_ENV=test because it resets the database");
  }

  // We assume postgres for now...
  const sql = postgres(newPgConnectionConfig());

  async function seed() {
    await sql`select flush_database()`;
    const driver = new PostgresDriver(sql);
    const em = new EntityManager({}, { driver }) as E;
    await fn(em);
    await em.flush();
  }

  seed()
    .then(async () => {
      console.log("Seeded!");
      await sql.end();
    })
    .catch(async (err) => {
      console.error(err);
      await sql.end();
      process.exit(1);
    });
}
