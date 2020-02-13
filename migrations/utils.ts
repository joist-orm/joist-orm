/** Creates an entity table with our conventions. */
import { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export function createEntityTable(b: MigrationBuilder, tableName: string, columns: ColumnDefinitions): void {
  b.createTable(tableName, {
    id: "id",
    ...columns,
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  createTriggers(b, tableName);
}

/** Makes a trigger to update the `updated_at` column. */
export function createTriggers(b: MigrationBuilder, tableName: string): void {
  b.createTrigger(tableName, `${tableName}_created_at`, {
    when: "BEFORE",
    operation: "INSERT",
    level: "ROW",
    function: "trigger_maybe_set_created_at",
  });
  b.createTrigger(tableName, `${tableName}_updated_at`, {
    when: "BEFORE",
    operation: "UPDATE",
    level: "ROW",
    function: "trigger_maybe_set_updated_at",
  });
}

export function createUpdatedAtFunction(b: MigrationBuilder): void {
  b.createFunction(
    "trigger_maybe_set_updated_at",
    [],
    { replace: true, language: "plpgsql", returns: "TRIGGER" },
    "BEGIN IF NEW.updated_at = OLD.updated_at THEN NEW.updated_at = NOW(); END IF; RETURN NEW; END;",
  );
}

export function createCreatedAtFunction(b: MigrationBuilder): void {
  b.createFunction(
    "trigger_maybe_set_created_at",
    [],
    { replace: true, language: "plpgsql", returns: "TRIGGER" },
    "BEGIN IF NEW.created_at IS NULL THEN NEW.created_at = NOW(); END IF; IF NEW.updated_at IS NULL THEN NEW.updated_at = NOW(); END IF; RETURN NEW; END;",
  );
}
