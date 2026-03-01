/**
 * Adapts SQLite schema objects to pg-structure's interface.
 *
 * This allows EntityDbMetadata to work with SQLite schemas without modification
 * by providing objects that match pg-structure's API shape.
 */

import { Action, type Column, type Index, type M2MRelation, type M2ORelation, type O2MRelation, type Table } from "pg-structure";
import {
  SqliteColumn,
  SqliteDb,
  SqliteForeignKey,
  SqliteIndex,
  SqliteM2MRelation,
  SqliteM2ORelation,
  SqliteO2MRelation,
  SqliteTable,
} from "./SqliteSchema";

/**
 * Wraps a SqliteDb to provide pg-structure's Db interface shape.
 */
export function adaptSqliteDb(sqliteDb: SqliteDb): AdaptedDb {
  return {
    tables: adaptTableCollection(sqliteDb.tables),
    types: [],
  };
}

export interface AdaptedDb {
  tables: AdaptedTableCollection;
  types: never[];
}

export interface AdaptedTableCollection extends Iterable<Table> {
  length: number;
  filter(fn: (t: Table) => boolean): AdaptedTableCollection;
  map<T>(fn: (t: Table) => T): T[];
  mapToArray<T>(fn: (t: Table) => T): T[];
  sortBy(key: keyof Table): AdaptedTableCollection;
  get(name: string): Table | undefined;
}

function adaptTableCollection(sqliteTables: Iterable<SqliteTable>): AdaptedTableCollection {
  const tables = [...sqliteTables];
  const adapted = tables.map((t) => adaptTable(t));
  const byName = new Map(adapted.map((t) => [t.name, t]));

  return {
    [Symbol.iterator]: () => adapted[Symbol.iterator](),
    length: adapted.length,
    filter(fn) {
      const filtered = adapted.filter(fn);
      return createAdaptedTableCollection(filtered);
    },
    map<T>(fn: (t: Table) => T): T[] {
      return adapted.map(fn);
    },
    mapToArray<T>(fn: (t: Table) => T): T[] {
      return adapted.map(fn);
    },
    sortBy(key) {
      const sorted = [...adapted].sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (typeof va === "string" && typeof vb === "string") {
          return va.localeCompare(vb);
        }
        return 0;
      });
      return createAdaptedTableCollection(sorted);
    },
    get(name) {
      return byName.get(name);
    },
  };
}

function createAdaptedTableCollection(tables: Table[]): AdaptedTableCollection {
  const byName = new Map(tables.map((t) => [t.name, t]));
  return {
    [Symbol.iterator]: () => tables[Symbol.iterator](),
    length: tables.length,
    filter(fn) {
      return createAdaptedTableCollection(tables.filter(fn));
    },
    map<T>(fn: (t: Table) => T): T[] {
      return tables.map(fn);
    },
    mapToArray<T>(fn: (t: Table) => T): T[] {
      return tables.map(fn);
    },
    sortBy(key) {
      const sorted = [...tables].sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (typeof va === "string" && typeof vb === "string") {
          return va.localeCompare(vb);
        }
        return 0;
      });
      return createAdaptedTableCollection(sorted);
    },
    get(name) {
      return byName.get(name);
    },
  };
}

// Cache adapted tables to ensure reference equality
const tableCache = new WeakMap<SqliteTable, Table>();

function adaptTable(sqliteTable: SqliteTable): Table {
  const cached = tableCache.get(sqliteTable);
  if (cached) return cached;

  const columnArray = [...sqliteTable.columns];
  const adaptedColumns = columnArray.map((c) => adaptColumn(c, sqliteTable));
  const columnMap = new Map(adaptedColumns.map((c) => [c.name, c]));

  const adapted: Table = {
    name: sqliteTable.name,
    columns: {
      [Symbol.iterator]: () => adaptedColumns[Symbol.iterator](),
      length: adaptedColumns.length,
      filter: (fn: (c: Column) => boolean) => adaptedColumns.filter(fn),
      map: <T>(fn: (c: Column) => T) => adaptedColumns.map(fn),
      get: (name: string) => columnMap.get(name),
    },
    get m2oRelations() {
      return sqliteTable.m2oRelations.map((r) => adaptM2ORelation(r));
    },
    get o2mRelations() {
      return sqliteTable.o2mRelations.map((r) => adaptO2MRelation(r));
    },
    get m2mRelations() {
      return sqliteTable.m2mRelations.map((r) => adaptM2MRelation(r));
    },
    schema: { name: sqliteTable.schema.name },
  } as Table;

  tableCache.set(sqliteTable, adapted);
  return adapted;
}

// Cache adapted columns
const columnCache = new WeakMap<SqliteColumn, Column>();

function adaptColumn(sqliteColumn: SqliteColumn, parentTable: SqliteTable): Column {
  const cached = columnCache.get(sqliteColumn);
  if (cached) return cached;

  const adapted: Column = {
    name: sqliteColumn.name,
    type: {
      name: sqliteColumn.type.name,
      shortName: sqliteColumn.type.shortName,
    },
    notNull: sqliteColumn.notNull,
    default: sqliteColumn.default,
    isPrimaryKey: sqliteColumn.isPrimaryKey,
    isForeignKey: sqliteColumn.isForeignKey,
    arrayDimension: 0,
    get uniqueIndexes() {
      return sqliteColumn.uniqueIndexes.map((i) => adaptIndex(i));
    },
    get foreignKeys() {
      return sqliteColumn.foreignKeys.map((fk) => adaptForeignKey(fk, parentTable));
    },
    comment: sqliteColumn.comment,
    commentData: sqliteColumn.commentData,
  } as Column;

  columnCache.set(sqliteColumn, adapted);
  return adapted;
}

function adaptIndex(sqliteIndex: SqliteIndex): Index {
  return {
    name: sqliteIndex.name,
    columns: sqliteIndex.columns.map((c) => ({ name: c.name })),
    isPartial: sqliteIndex.isPartial,
    isUnique: sqliteIndex.isUnique,
  } as Index;
}

function adaptForeignKey(sqliteFk: SqliteForeignKey, sourceTable: SqliteTable): any {
  return {
    name: sqliteFk.name,
    columns: sqliteFk.columns.map((c) => ({
      name: c.name,
      get referencedTable() {
        return adaptTable(sqliteFk.referencedTable);
      },
    })),
    get referencedTable() {
      return adaptTable(sqliteFk.referencedTable);
    },
    onDelete: mapAction(sqliteFk.onDelete),
    onUpdate: mapAction(sqliteFk.onUpdate),
    isDeferred: sqliteFk.isDeferred,
    isDeferrable: sqliteFk.isDeferrable,
  };
}

function adaptM2ORelation(sqliteRel: SqliteM2ORelation): M2ORelation {
  return {
    type: "m2o",
    get sourceTable() {
      return adaptTable(sqliteRel.sourceTable);
    },
    get targetTable() {
      return adaptTable(sqliteRel.targetTable);
    },
    get foreignKey() {
      return adaptForeignKey(sqliteRel.foreignKey, sqliteRel.sourceTable);
    },
  } as M2ORelation;
}

function adaptO2MRelation(sqliteRel: SqliteO2MRelation): O2MRelation {
  return {
    type: "o2m",
    get sourceTable() {
      return adaptTable(sqliteRel.sourceTable);
    },
    get targetTable() {
      return adaptTable(sqliteRel.targetTable);
    },
    get foreignKey() {
      return adaptForeignKey(sqliteRel.foreignKey, sqliteRel.targetTable);
    },
  } as O2MRelation;
}

function adaptM2MRelation(sqliteRel: SqliteM2MRelation): M2MRelation {
  return {
    type: "m2m",
    get sourceTable() {
      return adaptTable(sqliteRel.sourceTable);
    },
    get targetTable() {
      return adaptTable(sqliteRel.targetTable);
    },
    get joinTable() {
      return adaptTable(sqliteRel.joinTable);
    },
    get foreignKey() {
      return adaptForeignKey(sqliteRel.foreignKey, sqliteRel.joinTable);
    },
    get targetForeignKey() {
      return adaptForeignKey(sqliteRel.targetForeignKey, sqliteRel.joinTable);
    },
  } as M2MRelation;
}

function mapAction(action: string): Action {
  switch (action) {
    case "CASCADE":
      return Action.Cascade;
    case "RESTRICT":
      return Action.Restrict;
    case "SET NULL":
      return Action.SetNull;
    case "SET DEFAULT":
      return Action.SetDefault;
    default:
      return Action.NoAction;
  }
}
