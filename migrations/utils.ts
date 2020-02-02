/** Creates an entity table with our conventions. */
import { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export function createEntityTable(b: MigrationBuilder, tableName: string, columns: ColumnDefinitions): void {
  b.createTable(tableName, {
    id: "id",
    ...columns,
    created_at: { type: "timestamptz", notNull: true, default: b.func("NOW()") },
    updated_at: { type: "timestamptz", notNull: true, default: b.func("NOW()") },
  });
  createUpdatedAtTrigger(b, tableName);
}

/** Makes a trigger to update the `updated_at` column. */
export function createUpdatedAtTrigger(b: MigrationBuilder, tableName: string): void {
  b.createTrigger(tableName, `${tableName}_updated_at`, {
    when: "BEFORE",
    operation: "UPDATE",
    level: "ROW",
    function: "trigger_set_updated_at",
  });
}

export function createUpdatedAtFunction(b: MigrationBuilder): void {
  b.createFunction(
    "trigger_set_updated_at",
    [],
    { replace: true, language: "plpgsql", returns: "TRIGGER" },
    "BEGIN NEW.updated_at = NOW(); RETURN NEW; END;",
  );
}
