/** Creates an entity table with our conventions. */
import { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";
import { ColumnDefinition } from "node-pg-migrate/dist/operations/tablesTypes";
import { singular } from "pluralize";

export function createEntityTable(b: MigrationBuilder, tableName: string, columns: ColumnDefinitions): void {
  b.createTable(tableName, {
    id: "id",
    ...columns,
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });
  createTriggers(b, tableName);
}

export function createEnumTable(b: MigrationBuilder, tableName: string, values: Array<[string, string]>): void {
  b.createTable(tableName, {
    id: "id",
    code: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
  });
  b.addConstraint(tableName, `${tableName}_unique_enum_code_constraint`, "UNIQUE (code)");
  values.forEach(value => addEnumValue(b, tableName, value));
}
export function addEnumValue(b: MigrationBuilder, tableName: string, value: [string, string]): void {
  const [code, name] = value;
  validateEnumCode(code);
  b.sql(`INSERT INTO ${tableName} (code, name) VALUES ('${code}', '${name.replace("'", "''")}');`);
}

export function updateEnumValue(
  b: MigrationBuilder,
  tableName: string,
  previousCode: string,
  value: [string, string],
): void {
  const [code, name] = value;
  validateEnumCode(code);
  b.sql(`UPDATE ${tableName} SET code ='${code}', name = '${name.replace("'", "''")}' WHERE code = '${previousCode}';`);
}

function validateEnumCode(code: string): void {
  const codeRegex = /^[A-Z0-9_]+$/;
  if (!codeRegex.test(code))
    throw `ERROR: Invalid enum code specified: ${code}. Codes must match the regex: ${codeRegex}`;
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

export function foreignKey(
  otherTable: string,
  opts: Partial<ColumnDefinition> & Required<Pick<ColumnDefinition, "notNull">>,
): ColumnDefinition {
  return { type: "integer", references: otherTable, deferrable: true, deferred: true, ...opts };
}

export function createManyToManyTable(b: MigrationBuilder, tableName: string, table1: string, table2: string) {
  const column1 = `${singular(table1)}_id`;
  const column2 = `${singular(table2)}_id`;
  b.createTable(tableName, {
    id: "id",
    [column1]: foreignKey(table1, { notNull: true }),
    [column2]: foreignKey(table2, { notNull: true }),
    created_at: { type: "timestamptz", notNull: true, default: b.func("NOW()") },
  });
  b.createIndex(tableName, [column1, column2], { unique: true });
}
