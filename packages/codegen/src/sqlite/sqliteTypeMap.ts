import { DatabaseColumnType } from "../EntityDbMetadata";

/**
 * Maps declared SQLite column types to Joist's DatabaseColumnType.
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

const typeMapping: Record<string, DatabaseColumnType> = {
  // Integer types
  int: "integer",
  integer: "integer",
  tinyint: "smallint",
  smallint: "smallint",
  mediumint: "integer",
  bigint: "bigint",
  "unsigned big int": "bigint",
  int2: "smallint",
  int8: "bigint",

  // Boolean (SQLite stores as 0/1 INTEGER)
  boolean: "boolean",
  bool: "boolean",

  // Text types
  text: "text",
  character: "text",
  varchar: "varchar",
  "character varying": "character varying",
  "varying character": "character varying",
  nchar: "text",
  "native character": "text",
  nvarchar: "text",
  clob: "text",

  // Real types
  real: "real",
  double: "double precision",
  "double precision": "double precision",
  float: "real",
  numeric: "numeric",
  decimal: "decimal",

  // Date/time types (SQLite stores as TEXT, REAL, or INTEGER)
  date: "date",
  datetime: "timestamp without time zone",
  timestamp: "timestamp without time zone",
  "timestamp with time zone": "timestamp with time zone",
  "timestamp without time zone": "timestamp without time zone",
  timestamptz: "timestamp with time zone",

  // Binary
  blob: "bytea",

  // JSON (SQLite supports JSON functions on TEXT)
  json: "jsonb",
  jsonb: "jsonb",

  // UUID (stored as TEXT in SQLite)
  uuid: "uuid",
};

/**
 * Map a declared SQLite column type to Joist's DatabaseColumnType.
 *
 * @param declaredType The type as declared in CREATE TABLE
 * @returns The closest matching DatabaseColumnType
 */
export function mapSqliteType(declaredType: string): DatabaseColumnType {
  const normalized = normalizeSqliteType(declaredType);
  const mapped = typeMapping[normalized];
  if (mapped) return mapped;

  // Apply SQLite's type affinity rules as fallback
  const upper = normalized.toUpperCase();
  if (upper.includes("INT")) return "integer";
  if (upper.includes("CHAR") || upper.includes("CLOB") || upper.includes("TEXT")) return "text";
  if (upper.includes("BLOB")) return "bytea";
  if (upper.includes("REAL") || upper.includes("FLOA") || upper.includes("DOUB")) return "real";

  // NUMERIC affinity - could be integer or real
  return "numeric";
}

/**
 * Normalize a SQLite type declaration.
 *
 * Handles:
 * - Stripping size/precision: VARCHAR(255) → varchar
 * - Lowercasing: INTEGER → integer
 * - Multiple words: DOUBLE PRECISION → double precision
 */
function normalizeSqliteType(type: string): string {
  // Remove parentheses and their contents (size/precision)
  let normalized = type.replace(/\([^)]*\)/g, "").trim();

  // Lowercase
  normalized = normalized.toLowerCase();

  return normalized;
}

/**
 * Get the short name for a SQLite type.
 *
 * pg-structure provides both `type.name` and `type.shortName` - we emulate that.
 */
export function getSqliteTypeShortName(declaredType: string): string {
  const normalized = normalizeSqliteType(declaredType);

  // Some types have common abbreviations
  const shortNames: Record<string, string> = {
    "character varying": "varchar",
    "double precision": "double",
    "timestamp with time zone": "timestamptz",
    "timestamp without time zone": "timestamp",
    integer: "int",
    boolean: "bool",
  };

  return shortNames[normalized] || normalized;
}
