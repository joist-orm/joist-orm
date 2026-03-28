/**
 * SQLite-specific codegen entry point.
 *
 * This mirrors the main PostgreSQL codegen but uses SQLite for schema introspection.
 */

import type Database from "better-sqlite3";
import { saveFiles } from "ts-poet";
import { DbMetadata, EntityDbMetadata, failIfOverlappingFieldNames } from "./EntityDbMetadata";
import { assignTags } from "./assignTags";
import { maybeRunTransforms } from "./codemods";
import { Config, loadConfig, stripStiPlaceholders, warnInvalidConfigEntries, writeConfig } from "./config";
import { maybeSetForeignKeyOrdering } from "./foreignKeyOrdering";
import { generateFiles } from "./generate";
import { applyInheritanceUpdates } from "./inheritance";
import { PgEnumMetadata } from "./loadMetadata";
import { scanEntityFiles } from "./scanEntityFiles";
import { adaptSqliteDb, loadSqliteEnumMetadata, loadSqliteSchema } from "./sqlite";
import { isEntityTable, isJoinTable } from "./utils";

export interface SqliteCodegenOptions {
  /** The better-sqlite3 database instance. */
  db: Database.Database;
  /** Optional path to joist-config.json. Defaults to searching in cwd. */
  configPath?: string;
}

/**
 * Run Joist codegen against a SQLite database.
 */
export async function sqliteCodegen(options: SqliteCodegenOptions): Promise<void> {
  const { db } = options;
  const config = await loadConfig();

  const dbMetadata = loadSqliteSchemaMetadata(config, db);
  const { entities, enums, totalTables } = dbMetadata;

  console.log(
    `Found ${totalTables} total tables, ${entities.length} entity tables, ${Object.entries(enums).length} enum tables`,
  );
  console.log("");

  applyInheritanceUpdates(config, dbMetadata);
  assignTags(config, dbMetadata);
  await scanEntityFiles(config, dbMetadata);
  await maybeSetForeignKeyOrdering(config, dbMetadata.entities);

  // SQLite doesn't need flush_database function generation (handled differently)

  await maybeRunTransforms(config);

  for (const entity of entities) failIfOverlappingFieldNames(entity);
  warnInvalidConfigEntries(config, dbMetadata);

  await generateAndSaveFiles(config, dbMetadata);

  stripStiPlaceholders(config, entities);
  await writeConfig(config);
}

function loadSqliteSchemaMetadata(config: Config, db: Database.Database): DbMetadata {
  const sqliteDb = loadSqliteSchema(db);
  const adaptedDb = adaptSqliteDb(sqliteDb);

  const enums = loadSqliteEnumMetadata(adaptedDb, db, config);

  // SQLite has no native enum types
  const pgEnums: PgEnumMetadata = {};

  const entities = adaptedDb.tables
    .filter((t) => isEntityTable(config, t))
    .sortBy("name")
    .map((table) => new EntityDbMetadata(config, table, enums));

  const totalTables = adaptedDb.tables.length;
  const joinTables = adaptedDb.tables.filter((t) => isJoinTable(config, t)).map((t) => t.name);
  const entitiesByName = Object.fromEntries(entities.map((e) => [e.name, e]));

  return { entities, entitiesByName, enums, pgEnums, totalTables, joinTables };
}

async function generateAndSaveFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  const files = await generateFiles(config, dbMeta);
  const esmExt = config.esm ? (config.allowImportingTsExtensions ? "ts" : "js") : "";
  await saveFiles({
    toolName: "joist-codegen",
    directory: config.entitiesDirectory,
    files,
    toStringOpts: { importExtensions: esmExt || false },
  });
}
