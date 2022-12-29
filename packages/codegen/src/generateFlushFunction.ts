import { Client } from "pg";
import { Db } from "pg-structure";
import { Config } from "./config";
import { isEntityTable, isJoinTable, isSubClassTable } from "./utils";

/** Creates a `flush_database` stored procedure to truncate all of the tables between tests. */
export async function createFlushFunction(db: Db, client: Client, config: Config): Promise<void> {
  await client.query(generateFlushFunction(config, db));
}

function generateFlushFunction(config: Config, db: Db): string {
  const tables = db.tables.filter((t) => isEntityTable(config, t) || isJoinTable(config, t));
  tables.sort((a, b) => {
    const i = isSubClassTable(a) ? 1 : -1;
    const j = isSubClassTable(b) ? 1 : -1;
    return j - i;
  });
  // Note that, for whatever reason, doing DELETEs + ALTER SEQUENCEs is dramatically faster than TRUNCATEs.
  // On even a 40-table schema, TRUNCATEs (either 1 per table or even a single TRUNCATE with all tables) takes
  // 100s of milliseconds, where as DELETEs takes single-digit milliseconds and DELETEs + ALTER SEQUENCEs is
  // 10s of milliseconds.
  //
  // One cute idea would be to use a single sequence for all tables when running locally. That would
  // mean our flush_database function could reset a single sequence. Plus it would reduce bugs where
  // something "works" but only b/c in the test database, all entities have id = 1.
  const statements = tables

    .map((t) => t.name)
    .map((t) => `DELETE FROM "${t}"; ALTER SEQUENCE IF EXISTS "${t}_id_seq" RESTART WITH 1 INCREMENT BY 1;`)
    .join("\n");
  return `CREATE OR REPLACE FUNCTION flush_database() RETURNS void AS $$
    BEGIN
    ${statements}
    END;
   $$ LANGUAGE
    'plpgsql'`;
}
