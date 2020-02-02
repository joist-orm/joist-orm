import pgMigrate from "node-pg-migrate";
// import pgStructure, { Db } from "pg-structure";
import { Client, ClientConfig } from "pg";
// This also loads env.local if we're locally applying migrations.
// import { env, newPgConnectionConfig } from "@src/env";
// import { isEntityTable } from "./utils";

const productionDirectory = "/home/node/app/migrations";

export async function runMigrationsIfNeeded(dir: string = productionDirectory): Promise<void> {
  const config: ClientConfig = {
    host: "127.0.0.1",
    port: 5434,
    user: "joist",
    password: "local",
    database: "joist",
  };
  const client = new Client(config);
  await client.connect();

  try {
    await pgMigrate({
      dbClient: client,
      migrationsTable: "migrations",
      dir,
      count: (undefined as any) as number,
      direction: "up",
      ignorePattern: "(.*.d.ts)|(.*utils.[jt]s)|(migrate.[jt]s)|(migrate.test.[jt]s)",
      decamelize: true,
    });

    // const db = await pgStructure(config);
    // if (env.STAGE === "local" || env.STAGE === "docker") {
    //   console.log("Creating flush_database() function");
    //   await createFlushDbFunction(db, client);
    // }
  } finally {
    await client.end();
  }
}

// If we're being run locally.
if (require.main === module) {
  runMigrationsIfNeeded("./migrations").catch(err => {
    console.error(err);
  });
}
