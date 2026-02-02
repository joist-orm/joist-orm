import type Database from "better-sqlite3";
import type { Table } from "pg-structure";
import { pascalCase } from "change-case";
import { Config, EntityDbMetadata, PrimitiveField } from "../index";
import { EnumMetadata, EnumRow, EnumTableData } from "../loadMetadata";
import { AdaptedDb } from "./SqliteToPgAdapter";

/**
 * Load enum table metadata from a SQLite database.
 *
 * Enum tables are detected as tables with `id`, `code`, `name` columns
 * and without `created_at`/`updated_at` timestamps.
 */
export function loadSqliteEnumMetadata(
  adaptedDb: AdaptedDb,
  sqliteDb: Database.Database,
  config: Config,
): EnumMetadata {
  const enumTables = findEnumTables(adaptedDb, config);
  const result: EnumMetadata = {};

  for (const table of enumTables) {
    const rows = sqliteDb.prepare(`SELECT * FROM "${table.name}" ORDER BY id`).all() as EnumRow[];
    const idColumn = table.columns.get("id");
    const idType = idColumn?.type.name === "uuid" ? "uuid" : "integer";

    const extraPrimitives = new EntityDbMetadata(config, table).primitives.filter(
      (p: PrimitiveField) => !["code", "name"].includes(p.fieldName),
    );

    result[table.name] = {
      table: table,
      idType,
      name: pascalCase(table.name),
      rows,
      extraPrimitives,
    } as EnumTableData;
  }

  return result;
}

function findEnumTables(db: AdaptedDb, config: Config): Table[] {
  const enumTables: Table[] = [];

  for (const table of db.tables) {
    if (isEnumTable(table, config)) {
      enumTables.push(table);
    }
  }

  return enumTables;
}

function isEnumTable(table: Table, config: Config): boolean {
  const ignoredTables = config.ignoredTables || ["migrations", "pgmigrations"];
  if (ignoredTables.includes(table.name)) return false;

  const columnNames = [...table.columns].map((c) => c.name);

  // Must have id, code, name
  const hasRequiredColumns = ["id", "code", "name"].every((c) => columnNames.includes(c));
  if (!hasRequiredColumns) return false;

  // Should NOT have created_at or updated_at (indicating it's an entity table)
  const hasTimestamps = columnNames.includes("created_at") || columnNames.includes("createdAt") ||
                        columnNames.includes("updated_at") || columnNames.includes("updatedAt");
  if (hasTimestamps) return false;

  // Should not be explicitly marked as an entity table
  const hasIdColumn = columnNames.includes("id");
  if (!hasIdColumn) return false;

  return true;
}
