import type Database from "better-sqlite3";

import { type Action, Column, type Db, ForeignKey, Index, Items, Table } from "../pgMetadata.ts";
import { parseCreateTable } from "./parseCreateTable.ts";
import { sqliteColumnType } from "./sqliteTypeMap.ts";

/**
 * Loads a SQLite database's schema into the same catalog model that `loadPgMetadata` creates.
 *
 * Codegen then reads SQLite tables through the same `Table`/`Column`/`ForeignKey` objects as
 * PostgreSQL tables. The m2o/o2m/m2m relations come from the `Table` getters, so we only have to
 * link each foreign key into `foreignKeys`, `foreignKeysToThis`, and its columns.
 *
 * Load all tables before foreign keys, so that each foreign key can link to its target table.
 */
export function loadSqliteSchema(db: Database.Database): Db {
  const tables = new Items<Table>();
  const rawTables = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all() as { name: string; sql: string | null }[];

  // SQLite has one schema per database file, but codegen only includes the `public` schema by default
  for (const raw of rawTables) {
    // Virtual tables have no CREATE TABLE sql
    if (raw.sql) tables.push(new Table(raw.name, { name: "public" }));
  }

  for (const table of tables) {
    const parsed = parseCreateTable(rawTables.find((r) => r.name === table.name)!.sql!);
    loadColumns(db, table, parsed.columns);
    loadIndexes(db, table);

    for (const fk of parsed.foreignKeys) {
      const target = tables.find((t) => t.name === fk.referencedTable);
      if (!target) continue;
      const columns = fk.columns.map((name) => table.columns.get(name));
      const foreignKey = new ForeignKey(
        fk.name ?? `${table.name}_${fk.columns.join("_")}_fkey`,
        table,
        target,
        columns,
        fk.isDeferred,
        fk.isDeferrable,
        deleteAction(fk.onDelete),
      );
      table.foreignKeys.push(foreignKey);
      target.foreignKeysToThis.push(foreignKey);
      for (const column of columns) column.foreignKeys.push(foreignKey);
    }
  }

  return { tables, types: [] };
}

/** Adds the columns and primary key of `table`, using declared types from the parsed CREATE TABLE when possible. */
function loadColumns(db: Database.Database, table: Table, parsedColumns: { name: string; type: string }[]): void {
  // `table_xinfo` (instead of `table_info`) includes generated columns
  const rows = db.prepare(`PRAGMA table_xinfo(${quote(table.name)})`).all() as {
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
    hidden: number;
  }[];

  const pkColumns: { column: Column; position: number }[] = [];
  for (const row of rows) {
    // Hidden columns of virtual tables are not real columns
    if (row.hidden === 1) continue;
    const declaredType = parsedColumns.find((c) => c.name.toLowerCase() === row.name.toLowerCase())?.type || row.type;
    const column = new Column(
      row.name,
      sqliteColumnType(declaredType || "text"),
      // SQLite reports `INTEGER PRIMARY KEY` columns as nullable, but they are the rowid, so never null
      row.notnull === 1 || row.pk > 0,
      row.dflt_value,
      // 2 is a VIRTUAL generated column, and 3 is a STORED generated column
      row.hidden === 2 || row.hidden === 3,
      // SQLite has no array types
      0,
      // SQLite has no column comments
      null,
    );
    table.columns.push(column);
    if (row.pk > 0) pkColumns.push({ column, position: row.pk });
  }

  if (pkColumns.length > 0) {
    pkColumns.sort((a, b) => a.position - b.position);
    table.primaryKey = { columns: pkColumns.map((pk) => pk.column) };
    for (const { column } of pkColumns) column.isPrimaryKey = true;
  }
}

/**
 * Adds the indexes of `table`, and its unique constraints.
 *
 * SQLite creates an `sqlite_autoindex_*` index for each UNIQUE constraint, with origin `u`, so we
 * can find unique constraints without parsing the CREATE TABLE. An `INTEGER PRIMARY KEY` is the
 * table's rowid and has no index.
 */
function loadIndexes(db: Database.Database, table: Table): void {
  const rows = db.prepare(`PRAGMA index_list(${quote(table.name)})`).all() as {
    name: string;
    unique: number;
    origin: "c" | "u" | "pk";
    partial: number;
  }[];
  for (const row of rows) {
    const names = db.prepare(`PRAGMA index_info(${quote(row.name)})`).all() as { name: string | null }[];
    // Expression indexes have a null name for each expression column
    const columns = names.flatMap((c) => (c.name ? [table.columns.get(c.name)] : []));
    const index = new Index(row.name, columns, row.unique === 1, row.partial === 1);
    table.indexes.push(index);
    if (index.isUnique) for (const column of columns) column.uniqueIndexes.push(index);
    if (row.origin === "u") table.uniqueConstraints.push({ columns, index });
  }
}

function deleteAction(action: string): Action {
  switch (action.toUpperCase().replace(/\s+/g, " ")) {
    case "CASCADE":
      return "CASCADE";
    case "RESTRICT":
      return "RESTRICT";
    case "SET NULL":
      return "SET NULL";
    case "SET DEFAULT":
      return "SET DEFAULT";
    default:
      return "NO ACTION";
  }
}

/** Quotes an identifier for use in a PRAGMA argument. */
function quote(name: string): string {
  return `"${name.replaceAll(`"`, `""`)}"`;
}
