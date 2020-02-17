import pgMigrate from "node-pg-migrate";
import pgStructure, { Db, Table } from "pg-structure";
import { Client, ClientConfig } from "pg";

const productionDirectory = "/home/node/app/migrations";

export async function runMigrationsIfNeeded(dir: string = productionDirectory): Promise<void> {
  const config: ClientConfig = {
    host: "127.0.0.1",
    port: 5435,
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

    const db = await pgStructure(config);
    // if (env.STAGE === "local" || env.STAGE === "docker") {
    console.log("Creating flush_database() function");
    await createFlushDbFunction(db, client);
    // }
  } finally {
    await client.end();
  }
}
/** Creates a `flush_database` stored procedure to truncate all of the tables between tests. */
async function createFlushDbFunction(db: Db, client: Client): Promise<void> {
  await client.query(generateFlushFunction(db));
}

function generateFlushFunction(db: Db): string {
  const statements = db.tables
    .filter(isEntityTable)
    .map(t => `TRUNCATE ${t.name} RESTART IDENTITY CASCADE`)
    .join(";");
  return `CREATE OR REPLACE FUNCTION flush_database() RETURNS void AS $$ ${statements} $$ LANGUAGE SQL`;
}

export function isEntityTable(t: Table): boolean {
  const columnNames = t.columns.map(c => c.name);
  return includesAllOf(columnNames, ["id", "created_at", "updated_at"]);
}

function includesAllOf(set: string[], subset: string[]): boolean {
  return subset.find(e => !set.includes(e)) === undefined;
}
