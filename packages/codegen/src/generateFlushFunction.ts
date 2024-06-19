import { Client } from "pg";
import { DbMetadata } from "./EntityDbMetadata";

/** Creates a `flush_database` stored procedure to truncate all the tables between tests. */
export async function createFlushFunction(client: Client, db: DbMetadata): Promise<void> {
  await client.query(generateFlushFunction(db));
}

export function generateFlushFunction(db: DbMetadata): string {
  // Note that, for whatever reason, doing DELETEs + ALTER SEQUENCEs is dramatically faster than TRUNCATEs.
  // On even a 40-table schema, TRUNCATEs (either 1 per table or even a single TRUNCATE with all tables) takes
  // 100s of milliseconds, whereas DELETEs takes single-digit milliseconds and DELETEs + ALTER SEQUENCEs is
  // 10s of milliseconds.
  const entityDeletes = [...db.entities]
    // Flush books before authors if it has non-deferred FKs
    .sort((a, b) => {
      const x = a.nonDeferredFkOrder;
      const y = b.nonDeferredFkOrder;
      return y - x;
    })
    .filter((t) => !t.baseClassName)
    .flatMap((t) => {
      return [
        // If `last_value` is NULL then the sequence hasn't been used
        `SELECT last_value INTO sequence_value FROM pg_sequences where sequencename = '${t.tableName}_id_seq';`,
        `IF sequence_value IS NOT NULL THEN`,
        ...t.subTypes.flatMap((st) => `DELETE FROM "${st.tableName}";`),
        `DELETE FROM "${t.tableName}";`,
        `ALTER SEQUENCE "${t.tableName}_id_seq" RESTART WITH 1;`,
        `END IF;`,
      ];
    });
  const m2mDeletes = db.joinTables.flatMap((t) => {
    return [
      `SELECT last_value INTO sequence_value FROM pg_sequences where sequencename = '${t}_id_seq';`,
      `IF sequence_value IS NOT NULL THEN`,
      `DELETE FROM "${t}";`,
      `ALTER SEQUENCE "${t}_id_seq" RESTART WITH 1;`,
      `END IF;`,
    ];
  });

  // Create `SET NULLs` in schemas that don't have deferred FKs
  const setFksNulls = db.entities
    .filter((t) => t.nonDeferredFkOrder)
    .flatMap((t) =>
      t.manyToOnes
        // These FKs will auto-unset/delete the later row, so don't need explicit unsetting
        .filter((m2o) => m2o.onDelete !== "SET NULL" && m2o.onDelete !== "CASCADE")
        // Look for FKs to tables whose DELETEs come after us
        .filter((m2o) => db.entitiesByName[m2o.otherEntity.name].nonDeferredFkOrder > t.nonDeferredFkOrder)
        .map((m2o) => `UPDATE ${t.tableName} SET ${m2o.columnName} = NULL;`),
    );

  const statements = [...setFksNulls, ...m2mDeletes, ...entityDeletes].join("\n");

  // console.log({ statements });

  return `CREATE OR REPLACE FUNCTION flush_database() RETURNS void AS $$
    DECLARE sequence_value INTEGER;
    BEGIN
    ${statements}
    END;
   $$ LANGUAGE
    'plpgsql'`;
}
