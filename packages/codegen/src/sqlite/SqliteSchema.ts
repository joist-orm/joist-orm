/**
 * SQLite schema types that mirror pg-structure's API.
 *
 * These types provide the same interface as pg-structure so that EntityDbMetadata
 * can work with both PostgreSQL and SQLite schemas.
 */

/** Represents a SQLite database schema. */
export interface SqliteDb {
  tables: SqliteTableCollection;
  /** SQLite has no native enum types, so this is always empty. */
  types: never[];
}

/** A collection of tables with array-like iteration and Map-like access. */
export interface SqliteTableCollection extends Iterable<SqliteTable> {
  length: number;
  filter(fn: (t: SqliteTable) => boolean): SqliteTableCollection;
  map<T>(fn: (t: SqliteTable) => T): T[];
  mapToArray<T>(fn: (t: SqliteTable) => T): T[];
  sortBy(key: keyof SqliteTable): SqliteTableCollection;
  get(name: string): SqliteTable | undefined;
}

/** Represents a SQLite table. */
export interface SqliteTable {
  name: string;
  columns: SqliteColumnCollection;
  m2oRelations: SqliteM2ORelation[];
  o2mRelations: SqliteO2MRelation[];
  m2mRelations: SqliteM2MRelation[];
  /** SQLite only has one schema, but we match pg-structure's shape. */
  schema: { name: string };
}

/** A collection of columns with array-like iteration and Map-like access. */
export interface SqliteColumnCollection extends Iterable<SqliteColumn> {
  length: number;
  filter(fn: (c: SqliteColumn) => boolean): SqliteColumn[];
  map<T>(fn: (c: SqliteColumn) => T): T[];
  get(name: string): SqliteColumn | undefined;
}

/** Represents a SQLite column. */
export interface SqliteColumn {
  name: string;
  type: SqliteColumnType;
  notNull: boolean;
  default: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  /** SQLite doesn't have array types. */
  arrayDimension: 0;
  uniqueIndexes: SqliteIndex[];
  foreignKeys: SqliteForeignKey[];
  /** SQLite doesn't support column comments natively. */
  comment: string | undefined;
  /** Parsed JSON from comment, for compatibility with pg-structure. */
  commentData: unknown;
}

export interface SqliteColumnType {
  /** The declared type from CREATE TABLE, normalized. */
  name: string;
  /** Shorter version of the type name. */
  shortName: string;
}

export interface SqliteIndex {
  name: string;
  columns: SqliteColumn[];
  isPartial: boolean;
  isUnique: boolean;
}

export interface SqliteForeignKey {
  name: string;
  columns: SqliteColumn[];
  referencedTable: SqliteTable;
  referencedColumns: SqliteColumn[];
  onDelete: ForeignKeyAction;
  onUpdate: ForeignKeyAction;
  /** SQLite supports deferrable constraints but we default to false. */
  isDeferred: boolean;
  isDeferrable: boolean;
}

export type ForeignKeyAction = "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";

/** Many-to-one relation (FK on this table pointing to another). */
export interface SqliteM2ORelation {
  type: "m2o";
  sourceTable: SqliteTable;
  targetTable: SqliteTable;
  foreignKey: SqliteForeignKey;
}

/** One-to-many relation (FK on another table pointing to this one). */
export interface SqliteO2MRelation {
  type: "o2m";
  sourceTable: SqliteTable;
  targetTable: SqliteTable;
  foreignKey: SqliteForeignKey;
}

/** Many-to-many relation through a join table. */
export interface SqliteM2MRelation {
  type: "m2m";
  sourceTable: SqliteTable;
  targetTable: SqliteTable;
  joinTable: SqliteTable;
  foreignKey: SqliteForeignKey;
  targetForeignKey: SqliteForeignKey;
}
