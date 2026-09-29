import { sqlType } from "../pgMetadata.ts";

/**
 * Maps declared SQLite column types to PostgreSQL's internal type names, i.e. `pg_type.typname`.
 *
 * SQLite uses "type affinity" - declared types are just hints, and SQLite
 * stores data as one of: INTEGER, REAL, TEXT, BLOB, or NULL. However, we
 * parse the declared types from CREATE TABLE statements to get better
 * TypeScript type mappings.
 *
 * Type affinity rules (from SQLite docs):
 * 1. If contains "INT" → INTEGER affinity
 * 2. If contains "CHAR", "CLOB", or "TEXT" → TEXT affinity
 * 3. If contains "BLOB" or no type → BLOB affinity
 * 4. If contains "REAL", "FLOA", or "DOUB" → REAL affinity
 * 5. Otherwise → NUMERIC affinity
 */
const typeMapping: Record<string, string> = {
  // Integer types
  int: "int4",
  integer: "int4",
  tinyint: "int2",
  smallint: "int2",
  mediumint: "int4",
  bigint: "int8",
  "unsigned big int": "int8",
  int2: "int2",
  int8: "int8",

  // Boolean (SQLite stores as 0/1 INTEGER)
  boolean: "bool",
  bool: "bool",

  // Text types
  text: "text",
  character: "text",
  varchar: "varchar",
  "character varying": "varchar",
  "varying character": "varchar",
  nchar: "text",
  "native character": "text",
  nvarchar: "text",
  clob: "text",

  // Real types
  real: "float4",
  double: "float8",
  "double precision": "float8",
  float: "float4",
  numeric: "numeric",
  decimal: "numeric",

  // Date/time types (SQLite stores as TEXT, REAL, or INTEGER)
  date: "date",
  datetime: "timestamp",
  timestamp: "timestamp",
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  timestamptz: "timestamptz",

  // Binary
  blob: "bytea",

  // JSON (SQLite supports JSON functions on TEXT)
  json: "jsonb",
  jsonb: "jsonb",

  // UUID (stored as TEXT in SQLite)
  uuid: "uuid",
};

/**
 * Maps a declared SQLite column type to the `Column.type` that `loadPgMetadata` creates for the closest PostgreSQL type.
 *
 * I.e. `VARCHAR(255)` becomes `{ name: "character varying" }`, the same as a PostgreSQL `varchar(255)` column.
 */
export function sqliteColumnType(declaredType: string): { name: string; shortName?: string } {
  // Strip size/precision, i.e. VARCHAR(255) → varchar
  const normalized = declaredType
    .replace(/\([^)]*\)/g, "")
    .trim()
    .toLowerCase();
  return sqlType(typeMapping[normalized] ?? affinityType(normalized));
}

/** Applies SQLite's type affinity rules to a declared type that has no direct mapping. */
function affinityType(normalized: string): string {
  if (normalized.includes("int")) return "int4";
  if (normalized.includes("char") || normalized.includes("clob") || normalized.includes("text")) return "text";
  if (normalized.includes("blob")) return "bytea";
  if (normalized.includes("real") || normalized.includes("floa") || normalized.includes("doub")) return "float4";
  // NUMERIC affinity - could be integer or real
  return "numeric";
}
