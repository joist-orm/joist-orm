import pgMigrate from "node-pg-migrate";
import { Client } from "pg";

const productionDirectory = "/home/node/app/migrations";

export async function runMigrationsIfNeeded(client: Client, dir: string = productionDirectory): Promise<void> {
  await pgMigrate({
    dbClient: client,
    migrationsTable: "migrations",
    dir,
    count: undefined as any as number,
    direction: "up",
    ignorePattern: "(\\..*)|(.*\\.d\\.ts)|(.*utils\\.[jt]s)|(migrate\\.[jt]s)|(migrate\\.test\\.[jt]s)",
    // I generally dislike the magic of decamelize, but pragmatically it seems like a good foot-gun
    // mitigation to keep schemas always underscores/snake-based.
    // That said, provide an escape hatch, via the DECAMELIZE env var, which we also use for tests
    // since we want to specifically regression test the behavior of camelCased columns.
    decamelize: process.env.DECAMELIZE ? process.env.DECAMELIZE === "true" : true,
  });
}
