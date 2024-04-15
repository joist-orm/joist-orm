import { EntityManager, newPgConnectionConfig, PostgresDriver } from "joist-orm";
import { knex as createKnex } from "knex";

export function seed<E extends EntityManager = EntityManager>(fn: (em: E) => Promise<void>): void {
  const env = process.env.NODE_ENV;
  if (env !== "local" && env !== "test") {
    throw new Error("seed will only run with NODE_ENV=local or NODE_ENV=test because it resets the database");
  }

  const knex = createKnex({ client: "pg", connection: newPgConnectionConfig() });

  async function seed() {
    await knex.select(knex.raw("flush_database()"));
    const driver = new PostgresDriver(knex);
    const em = new EntityManager({}, { driver }) as E;
    await fn(em);
    await em.flush();
  }

  seed()
    .then(async () => {
      console.log("Seeded!");
      await knex.destroy();
    })
    .catch(async (err) => {
      console.error(err);
      await knex.destroy();
      process.exit(1);
    });
}
