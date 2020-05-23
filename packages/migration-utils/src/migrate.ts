import { Client } from "pg";
import pgMigrate from "node-pg-migrate";
import pgStructure, { Db, Table } from "pg-structure";
import { newPgConnectionConfig } from "joist-utils";

const productionDirectory = "/home/node/app/migrations";

export async function runMigrationsIfNeeded(dir: string = productionDirectory): Promise<void> {
  const client = new Client(newPgConnectionConfig());
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

    const db = await pgStructure(newPgConnectionConfig());

    if (process.env.ADD_FLUSH_DATABASE === "true") {
      console.log("Creating flush_database() function");
      await createFlushDbFunction(db, client);
    }
  } finally {
    await client.end();
  }
}
/** Creates a `flush_database` stored procedure to truncate all of the tables between tests. */
async function createFlushDbFunction(db: Db, client: Client): Promise<void> {
  await client.query(generateFlushFunction(db));
}

function generateFlushFunction(db: Db): string {
  const tables = db.tables.filter((t) => isEntityTable(t) || isJoinTable(t)).map((t) => t.name);
  // Note that, for whatever reason, doing DELETEs + ALTER SEQUENCEs is dramatically faster than TRUNCATEs.
  // On even a 40-table schema, TRUNCATEs (either 1 per table or even a single TRUNCATE with all tables) takes
  // 100s of milliseconds, where as DELETEs takes single-digit milliseconds and DELETEs + ALTER SEQUENCEs is
  // 10s of milliseconds.
  //
  // One cute idea would be to use a single sequence for all tables when running locally. That would
  // mean our flush_database function could reset a single sequence. Plus it would reduce bugs where
  // something "works" but only b/c in the test database, all entities have id = 1.
  const statements = tables
    .map((t) => `DELETE FROM "${t}"; ALTER SEQUENCE "${t}_id_seq" RESTART WITH 1 INCREMENT BY 1;`)
    .join("\n");
  return `CREATE OR REPLACE FUNCTION flush_database() RETURNS void AS $$
    BEGIN
    ${statements}
    END;
   $$ LANGUAGE
    'plpgsql'`;
}

export function isEntityTable(t: Table): boolean {
  const columnNames = t.columns.map((c) => c.name);
  return includesAllOf(columnNames, ["id", "created_at", "updated_at"]);
}

export function isJoinTable(t: Table): boolean {
  const { columns } = t;
  const hasOnePk = columns.filter((c) => c.isPrimaryKey).length === 1;
  const hasTwoFks = columns.filter((c) => c.isForeignKey).length === 2;
  const hasThreeColumns = columns.length === 3;
  const hasFourColumnsOneIsCreatedAt =
    columns.length === 4 && columns.filter((c) => c.name === "created_at").length === 1;
  return hasOnePk && hasTwoFks && (hasThreeColumns || hasFourColumnsOneIsCreatedAt);
}

function includesAllOf(set: string[], subset: string[]): boolean {
  return subset.find((e) => !set.includes(e)) === undefined;
}
