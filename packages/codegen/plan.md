# SQLite Codegen Implementation Plan

## Goal
Enable Joist codegen to work with SQLite databases by creating a SQLite schema introspection layer that produces the same metadata shape as pg-structure.

## Status: Phase 1-2 Complete ✓

## Key Challenges
1. **Type affinity** - ✓ Solved: Parse CREATE TABLE SQL to get declared types
2. **No native enums** - ✓ Handled: Uses enum tables (same as PostgreSQL)
3. **No column comments** - Partially handled: Config file needed for field overrides
4. **No relationship inference** - ✓ Solved: Computed from FK list
5. **Deferred FK parsing** - ✓ Solved: Parsed from CREATE TABLE SQL

## Implementation Progress

### Phase 1: SQLite Schema Introspection ✓

#### 1.1 `loadSqliteSchema.ts` ✓
- Queries `sqlite_master` for all tables
- Uses `PRAGMA table_info(table)` for columns
- Uses `PRAGMA index_list(table)` + `PRAGMA index_info(index)` for indexes
- Parses `CREATE TABLE` SQL to extract:
  - Declared column types (not just affinity)
  - Foreign key constraints with ON DELETE/ON UPDATE actions
  - Deferrable/deferred FK constraints
  - Unique constraints

#### 1.2 `SqliteSchema.ts` types ✓
Created interfaces mirroring pg-structure:
- `SqliteDb`, `SqliteTable`, `SqliteColumn`
- `SqliteTableCollection`, `SqliteColumnCollection`
- `SqliteM2ORelation`, `SqliteO2MRelation`, `SqliteM2MRelation`
- `SqliteForeignKey`, `SqliteIndex`

#### 1.3 `sqliteTypeMap.ts` ✓
Maps declared SQLite types to Joist's `DatabaseColumnType`:
- Integer types: INTEGER → integer, BIGINT → bigint
- Text types: TEXT/VARCHAR/CHAR → text/varchar
- Real types: REAL/DOUBLE/FLOAT → real/double precision
- Boolean: BOOLEAN → boolean
- Date/time: DATE/DATETIME/TIMESTAMP → date/timestamp
- Binary: BLOB → bytea
- JSON: JSON/JSONB → jsonb
- UUID: UUID → uuid
- Handles type affinity fallback for unknown types

#### 1.4 `parseCreateTable.ts` ✓
SQL parser for CREATE TABLE statements:
- Extracts column names, types, constraints
- Parses inline and table-level foreign keys
- Handles ON DELETE/ON UPDATE actions
- Parses DEFERRABLE INITIALLY DEFERRED
- Handles quoted identifiers
- Handles multi-column FKs and constraints

#### 1.5 Relationship computation ✓
- M2O relations created for each FK
- O2M relations created as inverse of M2O
- M2M relations detected for join tables (id + 2 FKs)

### Phase 2: pg-structure Adapter ✓

#### 2.1 `SqliteToPgAdapter.ts` ✓
Wraps SQLite schema objects to provide pg-structure-compatible interface:
- `adaptSqliteDb()` - wraps SqliteDb to match pg-structure's Db
- Adapted Table, Column, Index, ForeignKey types
- Adapted M2ORelation, O2MRelation, M2MRelation
- Lazy evaluation with caching for performance

#### 2.2 EntityDbMetadata compatibility ✓
- No changes needed to EntityDbMetadata!
- Adapter provides compatible interface
- All existing codegen logic works unchanged

#### 2.3 `sqliteCodegen.ts` entry point ✓
- New `sqliteCodegen(options)` function
- Takes `better-sqlite3` database instance
- Loads SQLite schema, adapts to pg-structure shape
- Runs full codegen pipeline

#### 2.4 `loadSqliteEnumMetadata.ts` ✓
- Loads enum table rows from SQLite
- Matches PostgreSQL enum loading behavior

### Phase 3: Config Additions (TODO)

#### 3.1 SQLite-specific config options
For column comments replacement (field overrides, enum arrays):
```typescript
interface JoistConfig {
  sqlite?: {
    typeOverrides?: Record<string, string>;  // table.column → TS type
    enumArrays?: Record<string, string>;     // table.column → enum table
    fieldNames?: Record<string, string>;     // table.column → field name
  };
}
```

### Phase 4: Testing

#### 4.1 Unit tests ✓
- `parseCreateTable.test.ts` - 13 tests for SQL parsing
- `sqliteTypeMap.test.ts` - 12 tests for type mapping

#### 4.2 Integration tests (TODO)
- Create test schema with various types/relationships
- Run codegen, verify output matches expected entities
- Test with actual better-sqlite3 database

## Files Created
- `packages/codegen/src/sqlite/SqliteSchema.ts` ✓
- `packages/codegen/src/sqlite/loadSqliteSchema.ts` ✓
- `packages/codegen/src/sqlite/sqliteTypeMap.ts` ✓
- `packages/codegen/src/sqlite/parseCreateTable.ts` ✓
- `packages/codegen/src/sqlite/SqliteToPgAdapter.ts` ✓
- `packages/codegen/src/sqlite/loadSqliteEnumMetadata.ts` ✓
- `packages/codegen/src/sqlite/index.ts` ✓
- `packages/codegen/src/sqliteCodegen.ts` ✓
- `packages/codegen/src/sqlite/parseCreateTable.test.ts` ✓
- `packages/codegen/src/sqlite/sqliteTypeMap.test.ts` ✓

## Files Modified
- `packages/codegen/src/index.ts` - exports `sqliteCodegen`
- `packages/codegen/package.json` - added `better-sqlite3` peer dep + types

## Usage

```typescript
import Database from "better-sqlite3";
import { sqliteCodegen } from "joist-codegen";

const db = new Database("./myapp.db");
await sqliteCodegen({ db });
```

## Remaining Work
1. Add config options for SQLite-specific field overrides (replacing column comments)
2. Integration tests with real SQLite database
3. Documentation
4. Consider: Support for SQLite JSON array columns as enum arrays

## Answered Questions
1. **JSON arrays**: Not in v1 scope - use config for enum arrays
2. **rowid vs INTEGER PRIMARY KEY**: Handled by checking isPrimaryKey from PRAGMA
3. **Deferred FKs**: ✓ Parsed from CREATE TABLE SQL
4. **SQLite driver client**: Uses `better-sqlite3`, same as joist-driver-sqlite
