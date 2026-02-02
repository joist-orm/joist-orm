import type Database from "better-sqlite3";
import {
  ForeignKeyAction,
  SqliteColumn,
  SqliteColumnCollection,
  SqliteDb,
  SqliteForeignKey,
  SqliteIndex,
  SqliteM2MRelation,
  SqliteM2ORelation,
  SqliteO2MRelation,
  SqliteTable,
  SqliteTableCollection,
} from "./SqliteSchema";
import { parseCreateTable, ParsedColumn, ParsedForeignKey, ParsedTable } from "./parseCreateTable";
import { getSqliteTypeShortName, mapSqliteType } from "./sqliteTypeMap";

/**
 * Load SQLite database schema metadata.
 *
 * This provides a pg-structure-compatible interface for SQLite databases,
 * allowing Joist's codegen to work with both PostgreSQL and SQLite.
 */
export function loadSqliteSchema(db: Database.Database): SqliteDb {
  const rawTables = loadRawTableInfo(db);
  const parsedTables = new Map<string, ParsedTable>();
  const tables = new Map<string, SqliteTable>();

  // First pass: create all tables
  for (const raw of rawTables) {
    const parsed = parseCreateTable(raw.sql);
    parsedTables.set(raw.name, parsed);

    const table: SqliteTable = {
      name: raw.name,
      columns: null as unknown as SqliteColumnCollection, // filled in below
      m2oRelations: [],
      o2mRelations: [],
      m2mRelations: [],
      schema: { name: "main" },
    };
    tables.set(raw.name, table);
  }

  // Second pass: create columns with references to tables
  for (const raw of rawTables) {
    const table = tables.get(raw.name)!;
    const parsed = parsedTables.get(raw.name)!;
    const columns = buildColumns(db, table, parsed, tables);
    (table as any).columns = columns;
  }

  // Third pass: build relationships
  for (const table of tables.values()) {
    buildRelationships(table, tables);
  }

  // Fourth pass: detect and build m2m relationships
  const joinTables = detectJoinTables(tables);
  for (const joinTable of joinTables) {
    buildManyToManyRelations(joinTable, tables);
  }

  return {
    tables: createTableCollection(tables),
    types: [],
  };
}

interface RawTableInfo {
  name: string;
  sql: string;
}

function loadRawTableInfo(db: Database.Database): RawTableInfo[] {
  const rows = db.prepare(`
    SELECT name, sql FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as { name: string; sql: string }[];

  return rows.filter((r) => r.sql); // Filter out tables without SQL (virtual tables, etc.)
}

function buildColumns(
  db: Database.Database,
  table: SqliteTable,
  parsed: ParsedTable,
  tables: Map<string, SqliteTable>,
): SqliteColumnCollection {
  const parsedColMap = new Map<string, ParsedColumn>();
  for (const col of parsed.columns) {
    parsedColMap.set(col.name.toLowerCase(), col);
  }

  // Get columns from PRAGMA (authoritative for column list)
  const pragmaColumns = db.prepare(`PRAGMA table_info("${table.name}")`).all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;

  // Get indexes for unique constraint detection
  const indexes = loadIndexes(db, table.name);

  // Build FK lookup
  const fkByColumn = new Map<string, ParsedForeignKey>();
  for (const fk of parsed.foreignKeys) {
    if (fk.columns.length === 1) {
      fkByColumn.set(fk.columns[0].toLowerCase(), fk);
    }
  }

  const columns = new Map<string, SqliteColumn>();

  for (const pragma of pragmaColumns) {
    const parsedCol = parsedColMap.get(pragma.name.toLowerCase());
    const fk = fkByColumn.get(pragma.name.toLowerCase());

    // Use declared type from parsed SQL if available, else fall back to PRAGMA
    const declaredType = parsedCol?.type || pragma.type || "text";

    const column: SqliteColumn = {
      name: pragma.name,
      type: {
        name: mapSqliteType(declaredType) as string,
        shortName: getSqliteTypeShortName(declaredType),
      },
      notNull: pragma.notnull === 1,
      default: pragma.dflt_value,
      isPrimaryKey: pragma.pk > 0,
      isForeignKey: !!fk,
      arrayDimension: 0,
      uniqueIndexes: [],
      foreignKeys: [],
      comment: undefined,
      commentData: undefined,
    };

    // Build foreign keys for this column
    if (fk) {
      const refTable = tables.get(fk.referencedTable);
      if (refTable) {
        const foreignKey: SqliteForeignKey = {
          name: fk.name || `fk_${table.name}_${pragma.name}`,
          columns: [column],
          referencedTable: refTable,
          referencedColumns: [], // filled in later when ref table columns are built
          onDelete: normalizeAction(fk.onDelete),
          onUpdate: normalizeAction(fk.onUpdate),
          isDeferred: fk.isDeferred,
          isDeferrable: fk.isDeferrable,
        };
        column.foreignKeys.push(foreignKey);
      }
    }

    columns.set(pragma.name, column);
  }

  // Link unique indexes to columns
  for (const index of indexes) {
    if (index.isUnique && index.columns.length === 1) {
      const colName = index.columns[0];
      const col = columns.get(colName);
      if (col) {
        const sqliteIndex: SqliteIndex = {
          name: index.name,
          columns: [col],
          isPartial: index.isPartial,
          isUnique: true,
        };
        col.uniqueIndexes.push(sqliteIndex);
      }
    }
  }

  // Also check for unique constraints from parsed table
  for (const unique of parsed.uniqueConstraints) {
    if (unique.columns.length === 1) {
      const col = columns.get(unique.columns[0]);
      if (col && !col.uniqueIndexes.some((i) => i.columns.length === 1)) {
        col.uniqueIndexes.push({
          name: unique.name || `unique_${table.name}_${unique.columns[0]}`,
          columns: [col],
          isPartial: false,
          isUnique: true,
        });
      }
    }
  }

  return createColumnCollection(columns);
}

interface RawIndex {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPartial: boolean;
}

function loadIndexes(db: Database.Database, tableName: string): RawIndex[] {
  const indexList = db.prepare(`PRAGMA index_list("${tableName}")`).all() as Array<{
    seq: number;
    name: string;
    unique: number;
    origin: string;
    partial: number;
  }>;

  const indexes: RawIndex[] = [];

  for (const idx of indexList) {
    const indexInfo = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as Array<{
      seqno: number;
      cid: number;
      name: string;
    }>;

    indexes.push({
      name: idx.name,
      columns: indexInfo.map((i) => i.name),
      isUnique: idx.unique === 1,
      isPartial: idx.partial === 1,
    });
  }

  return indexes;
}

function buildRelationships(table: SqliteTable, tables: Map<string, SqliteTable>): void {
  for (const column of table.columns) {
    for (const fk of column.foreignKeys) {
      const targetTable = fk.referencedTable;

      // m2o: this table has FK pointing to target
      const m2o: SqliteM2ORelation = {
        type: "m2o",
        sourceTable: table,
        targetTable,
        foreignKey: fk,
      };
      table.m2oRelations.push(m2o);

      // o2m: target table has many of this table
      const o2m: SqliteO2MRelation = {
        type: "o2m",
        sourceTable: targetTable,
        targetTable: table,
        foreignKey: fk,
      };
      targetTable.o2mRelations.push(o2m);
    }
  }
}

function detectJoinTables(tables: Map<string, SqliteTable>): SqliteTable[] {
  const joinTables: SqliteTable[] = [];

  for (const table of tables.values()) {
    const cols = [...table.columns];
    const pkCols = cols.filter((c) => c.isPrimaryKey);
    const fkCols = cols.filter((c) => c.isForeignKey);

    const hasOnePk = pkCols.length === 1;
    const hasTwoFks = fkCols.length === 2;
    const hasThreeCols = cols.length === 3;
    const hasFourColsWithCreatedAt =
      cols.length === 4 && cols.some((c) => c.name === "created_at" || c.name === "createdAt");

    if (hasOnePk && hasTwoFks && (hasThreeCols || hasFourColsWithCreatedAt)) {
      joinTables.push(table);
    }
  }

  return joinTables;
}

function buildManyToManyRelations(joinTable: SqliteTable, tables: Map<string, SqliteTable>): void {
  const fkColumns = [...joinTable.columns].filter((c) => c.isForeignKey);
  if (fkColumns.length !== 2) return;

  const fk1 = fkColumns[0].foreignKeys[0];
  const fk2 = fkColumns[1].foreignKeys[0];
  if (!fk1 || !fk2) return;

  const table1 = fk1.referencedTable;
  const table2 = fk2.referencedTable;

  // Add m2m from table1's perspective
  const m2m1: SqliteM2MRelation = {
    type: "m2m",
    sourceTable: table1,
    targetTable: table2,
    joinTable,
    foreignKey: fk1,
    targetForeignKey: fk2,
  };
  table1.m2mRelations.push(m2m1);

  // Add m2m from table2's perspective
  const m2m2: SqliteM2MRelation = {
    type: "m2m",
    sourceTable: table2,
    targetTable: table1,
    joinTable,
    foreignKey: fk2,
    targetForeignKey: fk1,
  };
  table2.m2mRelations.push(m2m2);
}

function normalizeAction(action: string): ForeignKeyAction {
  const upper = action.toUpperCase().replace(/\s+/g, " ");
  switch (upper) {
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

function createTableCollection(tables: Map<string, SqliteTable>): SqliteTableCollection {
  const arr = [...tables.values()];

  const collection: SqliteTableCollection = {
    [Symbol.iterator]: () => arr[Symbol.iterator](),
    length: arr.length,
    filter(fn) {
      return createTableCollection(new Map(arr.filter(fn).map((t) => [t.name, t])));
    },
    map<T>(fn: (t: SqliteTable) => T): T[] {
      return arr.map(fn);
    },
    mapToArray<T>(fn: (t: SqliteTable) => T): T[] {
      return arr.map(fn);
    },
    sortBy(key) {
      const sorted = [...arr].sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (typeof va === "string" && typeof vb === "string") {
          return va.localeCompare(vb);
        }
        return 0;
      });
      return createTableCollection(new Map(sorted.map((t) => [t.name, t])));
    },
    get(name) {
      return tables.get(name);
    },
  };

  return collection;
}

function createColumnCollection(columns: Map<string, SqliteColumn>): SqliteColumnCollection {
  const arr = [...columns.values()];

  return {
    [Symbol.iterator]: () => arr[Symbol.iterator](),
    length: arr.length,
    filter(fn) {
      return arr.filter(fn);
    },
    map<T>(fn: (c: SqliteColumn) => T): T[] {
      return arr.map(fn);
    },
    get(name) {
      return columns.get(name);
    },
  };
}
