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
    ignorePattern: "(.*.d.ts)|(.*utils.[jt]s)|(migrate.[jt]s)|(migrate.test.[jt]s)",
    decamelize: true,
  });
}
