import { Client } from "pg";
import { DbMetadata } from "./EntityDbMetadata";

/** Creates a `flush_database` stored procedure to truncate all the tables between tests. */
export async function createFlushFunction(client: Client, db: DbMetadata): Promise<void> {
  await client.query(generateFlushFunction(db));
}

export function generateFlushFunction(db: DbMetadata): string {
  // Leave code/enum tables alone
  const tables = [
    ...[...db.entities]
      // Flush base tables before sub-tables.
      .sort((a, b) => {
        const i = a.baseClassName ? 1 : -1;
        const j = b.baseClassName ? 1 : -1;
        return j - i;
      })
      .map((e) => e.tableName),
    ...db.joinTables,
  ];
  // Note that, for whatever reason, doing DELETEs + ALTER SEQUENCEs is dramatically faster than TRUNCATEs.
  // On even a 40-table schema, TRUNCATEs (either 1 per table or even a single TRUNCATE with all tables) takes
  // 100s of milliseconds, whereas DELETEs takes single-digit milliseconds and DELETEs + ALTER SEQUENCEs is
  // 10s of milliseconds.
  //
  // One cute idea would be to use a single sequence for all tables when running locally. That would
  // mean our flush_database function could reset a single sequence. Plus it would reduce bugs where
  // something "works" but only b/c in the test database, all entities have id = 1.
  const statements = tables
    .map((t) => `DELETE FROM "${t}"; ALTER SEQUENCE IF EXISTS "${t}_id_seq" RESTART WITH 1 INCREMENT BY 1;`)
    .join("\n");
  return `CREATE OR REPLACE FUNCTION flush_database() RETURNS void AS $$
    BEGIN
    ${statements}
    END;
   $$ LANGUAGE
    'plpgsql'`;
}
