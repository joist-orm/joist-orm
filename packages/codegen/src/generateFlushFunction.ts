import { Client } from "pg";
import { DbMetadata } from "./EntityDbMetadata";

/** Creates a `flush_database` stored procedure to truncate all the tables between tests. */
export async function createFlushFunction(client: Client, db: DbMetadata): Promise<void> {
  const hasAnyNonDeferredFks = db.entities.some((e) => e.nonDeferredFks.length > 0);
  const hasAnyNonSequenceIds = db.entities.some((e) => e.primaryKey.columnType === "uuid");
  if (hasAnyNonSequenceIds || hasAnyNonDeferredFks) {
    await client.query(generateExplicitFlushFunction(db));
  } else {
    await client.query(generateSequenceFlushFunction(db));
  }
}

/**
 * Explicitly deletes every entity/m2m table in a deterministic order.
 *
 * We do this for schemas with non-deferred foreign keys (order matters)
 * or schemas with UUID id columns.
 */
export function generateExplicitFlushFunction(db: DbMetadata): string {
  // Leave code/enum tables alone
  const tables = [
    ...[...db.entities]
      .sort((a, b) => {
        // Flush books before authors if it has non-deferred FKs
        const x = a.nonDeferredFkOrder;
        const y = b.nonDeferredFkOrder;
        if (x !== y) {
          return y - x;
        }
        // Flush base tables before sub-tables.
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
  const deletes = tables.flatMap((t) => [
    `DELETE FROM "${t}";`,
    `ALTER SEQUENCE IF EXISTS "${t}_id_seq" RESTART WITH 1 INCREMENT BY 1;`,
  ]);

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

  const statements = [...setFksNulls, ...deletes].join("\n");

  return `CREATE OR REPLACE FUNCTION flush_database() RETURNS void AS $$
    BEGIN
      ${statements}
    END;
   $$ LANGUAGE
    'plpgsql'`;
}

/**
 * A cuter/shorter flush that only DELETEs from tables that were inserted into.
 *
 * The difference between this and the explicit-order function should only be
 * noticeable on 100+ table schemas (specifically, on our production app with ~200 tables
 * and ~5,000 tests, it gave an 8% speed-up vs. the "DELETE every table" approach).
 */
export function generateSequenceFlushFunction(db: DbMetadata): string {
  const enumTables = Object.values(db.enums).map((e) => e.table);
  // We don't currently have a way to filter out the enum sequences in a query
  const maybeSkipEnums =
    enumTables.length === 0
      ? ""
      : `AND sequencename NOT IN (${enumTables.map((t) => `'${t.name}_id_seq'`).join(", ")})`;
  return `CREATE OR REPLACE FUNCTION flush_database() RETURNS void AS $$
    DECLARE seq RECORD;
    BEGIN
      FOR seq IN
        SELECT sequencename AS name
        FROM pg_sequences
        WHERE schemaname = 'public' AND last_value IS NOT NULL AND sequencename LIKE '%_id_seq' ${maybeSkipEnums}
      LOOP
        EXECUTE format('DELETE FROM %I', regexp_replace(seq.name, '_id_seq$', ''));
        EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', seq.name);
      END LOOP;
    END;
   $$ LANGUAGE
    'plpgsql'`;
}
