#!/usr/bin/env node

import { existsSync } from "node:fs";
import process from "node:process";

import type Database from "better-sqlite3";
import { type ConnectionConfig, newPgConnectionConfig } from "joist-utils";
import { Client } from "pg";
import { saveFiles } from "ts-poet";

import { assignTags } from "./assignTags.ts";
import { maybeRunTransforms } from "./codemods/index.ts";
import { type Config, loadConfig, stripStiPlaceholders, warnInvalidConfigEntries, writeConfig } from "./config.ts";
import {
  type DbMetadata,
  EntityDbMetadata,
  failIfOverlappingFieldNames,
  resolveNameConflicts,
} from "./EntityDbMetadata.ts";
import { maybeSetForeignKeyOrdering } from "./foreignKeyOrdering.ts";
import { generateFiles } from "./generate.ts";
import { createFlushFunction } from "./generateFlushFunction.ts";
import { applyInheritanceUpdates } from "./inheritance.ts";
import { installSkills } from "./installSkills.ts";
import { loadEnumMetadata, loadPgEnumMetadata } from "./loadMetadata.ts";
import { LOG_LEVELS, loggerMaxWarningLevelHit } from "./logger.ts";
import { loadPgMetadata } from "./pgMetadata.ts";
import { scanEntityFiles } from "./scanEntityFiles.ts";
import { loadSqliteSchema } from "./sqlite/loadSqliteSchema.ts";
import {
  isEntityTable,
  isEnumTable,
  isJoinTable,
  mapSimpleDbTypeToTypescriptType,
  shouldIncludeSchema,
  tableToEntityName,
} from "./utils.ts";

export {
  type DbMetadata,
  type EnumField,
  makeEntity,
  type ManyToManyField,
  type ManyToOneField,
  type OneToManyField,
  type OneToOneField,
  type PolymorphicField,
  type PrimitiveField,
  type PrimitiveTypescriptType,
} from "./EntityDbMetadata.ts";
export type { EnumMetadata, EnumRow, EnumTableData, PgEnumData, PgEnumMetadata } from "./loadMetadata.ts";
export { dateCode, plainDateCode, plainDateTimeCode, zonedDateTimeCode } from "./utils.ts";
export { type Config, EntityDbMetadata, mapSimpleDbTypeToTypescriptType };

export async function joistCodegen() {
  // pg-structure used to load .env on import; keep that behavior for fixtures and apps
  // that provide DATABASE_URL in a local .env without a separate dotenv bootstrap.
  if (existsSync(".env")) process.loadEnvFile();
  const config = await loadConfig();

  maybeSetDatabaseUrl(config);
  if (!process.env.DATABASE_URL && !process.env.DB_USER) {
    console.log(`Database connection information not found, please set either:`);
    console.log(`  - the DATABASE_URL env variable (i.e. using .env and dotenv), or`);
    console.log(`  - the databaseUrl key in joist-config.json`);
    return;
  }
  // A `sqlite:<path>` url reads the schema from that SQLite file, instead of connecting to PostgreSQL
  const sqlite = await maybeOpenSqlite();
  const pgConfig = sqlite ? undefined : newPgConnectionConfig();

  const client = sqlite ?? new Client(pgConfig);
  if (client instanceof Client) await client.connect();

  const dbMetadata = await loadSchemaMetadata(config, client);
  const { entities, enums, totalTables } = dbMetadata;
  console.log(
    `Found ${totalTables} total tables, ${entities.length} entity tables, ${Object.entries(enums).length} enum tables`,
  );
  console.log("");

  // Look for STI tables to synthesize separate metas
  applyInheritanceUpdates(config, dbMetadata);

  // Now that all entities (incl. STI subtypes) are known, fix up any colliding codegen'd type names
  resolveNameConflicts(config, dbMetadata);

  // Assign any new tags and write them back to the config file
  assignTags(config, dbMetadata);
  validateTagDelimiter(config, entities);

  // Scan `*.ts` files after we've expanded `Task` -> `TaskOld.ts`
  await scanEntityFiles(config, dbMetadata);

  // If we're not using deferred FKs, determine our DAG insert order
  await maybeSetForeignKeyOrdering(config, dbMetadata.entities);

  // Generate the flush function for tests, which SQLite can't have, because it has no stored functions
  if (client instanceof Client) await maybeGenerateFlushFunctions(config, client, pgConfig!, dbMetadata);

  await (client instanceof Client ? client.end() : client.close());

  // Apply any codemods to the user's codebase, if we have them
  await maybeRunTransforms(config);

  // Do some warnings
  for (const entity of entities) failIfOverlappingFieldNames(entity);
  warnInvalidConfigEntries(config, dbMetadata);

  // Finally actually generate the files (even if we found a fatal error)
  await generateAndSaveFiles(config, dbMetadata);

  // Install our bundled Agent Skills so coding agents can find them, unless explicitly disabled
  if (config.skills !== false) await installSkills();

  stripStiPlaceholders(config, entities);
  await writeConfig(config);
}

/** Uses entities and enums from the `db` schema and saves them into our entities directory. */
export async function generateAndSaveFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  const files = await generateFiles(config, dbMeta);
  const esmExt = config.esm ? (config.allowImportingTsExtensions ? "ts" : "js") : "";
  await saveFiles({
    toolName: "joist-codegen",
    directory: config.entitiesDirectory,
    files,
    toStringOpts: { importExtensions: esmExt || false },
  });
}

async function maybeGenerateFlushFunctions(config: Config, client: Client, pgConfig: ConnectionConfig, db: DbMetadata) {
  // In graphql-service we have our own custom flush function, so allow skipping this
  if (config.createFlushFunction !== false) {
    // Look for multiple test databases
    if (Array.isArray(config.createFlushFunction)) {
      console.log("Creating flush_database functions");
      await Promise.all(
        config.createFlushFunction.map(async (dbName) => {
          const client = new Client({ ...pgConfig, database: dbName });
          await client.connect();
          await createFlushFunction(client, db);
          await client.end();
        }),
      );
    } else {
      console.log("Creating flush_database function");
      await createFlushFunction(client, db);
    }
  }
}

async function loadSchemaMetadata(config: Config, client: Client | Database.Database): Promise<DbMetadata> {
  const isPg = client instanceof Client;
  // Load all user schemas so cross-schema foreign keys can be resolved. Codegen filters
  // non-public tables below; trigger functions in other schemas do not affect entities.
  const db = isPg ? await loadPgMetadata(client) : loadSqliteSchema(client);
  // better-sqlite3 is synchronous, so wrap it in the async `query` shape that enum loading expects
  const queryClient = isPg ? client : { query: async (sql: string) => ({ rows: client.prepare(sql).all() }) };
  const enums = await loadEnumMetadata(db, queryClient, config);
  const pgEnums = await loadPgEnumMetadata(db, queryClient, config);
  // The order also controls generated exports; sorting physical table names puts book_reviews
  // before books and changes initialization order for entity modules with circular imports.
  const entities = db.tables
    .filter((t) => isEntityTable(config, t))
    .sort((a, b) => tableToEntityName(config, a).localeCompare(tableToEntityName(config, b)))
    .map((table) => new EntityDbMetadata(config, table, enums));
  const totalTables = db.tables.length;
  const joinTables = db.tables.filter((t) => isJoinTable(config, t)).map((t) => t.name);
  const otherTables = db.tables
    .filter(
      (t) =>
        shouldIncludeSchema(config, t) &&
        !isEntityTable(config, t) &&
        !isEnumTable(config, t) &&
        !isJoinTable(config, t),
    )
    .map((t) => t.name);
  const entitiesByName = Object.fromEntries(entities.map((e) => [e.name, e]));
  return { entities, entitiesByName, enums, pgEnums, totalTables, joinTables, otherTables };
}

/** Opens the file of a `sqlite:<path>` DATABASE_URL, or returns undefined for PostgreSQL. */
async function maybeOpenSqlite(): Promise<Database.Database | undefined> {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("sqlite:")) return undefined;
  const path = url.slice("sqlite:".length);
  // Fail on a missing file, instead of creating an empty database and generating no entities
  if (!existsSync(path)) {
    throw new Error(`SQLite database ${path} from DATABASE_URL does not exist, run your migrations first`);
  }
  // better-sqlite3 is an optional peer dependency, so only load it for SQLite projects
  const { default: SqliteDatabase } = await import("better-sqlite3");
  return new SqliteDatabase(path, { readonly: true });
}

function maybeSetDatabaseUrl(config: Config): void {
  if (!process.env.DATABASE_URL && config.databaseUrl) {
    process.env.DATABASE_URL = config.databaseUrl;
  }
}

export function maybeSetExitCode(): void {
  if (
    !process.argv.includes("--always-exit-code-zero") &&
    // strict mode + warnings or greater
    ((process.argv.includes("--strict") && loggerMaxWarningLevelHit >= LOG_LEVELS.warn) ||
      // otherwise errors or greater
      loggerMaxWarningLevelHit >= LOG_LEVELS.error)
  ) {
    process.exitCode = 1;
  }
}

/** Validates that tags can be parsed unambiguously with the configured delimiter. */
function validateTagDelimiter(config: Config, entities: EntityDbMetadata[]): void {
  const tagDelimiter = config.tagDelimiter ?? ":";
  for (const entity of entities) {
    if (tagDelimiter !== "" && `${entity.tagName}${tagDelimiter}`.indexOf(tagDelimiter) !== entity.tagName.length) {
      throw new Error(
        `Tagged id delimiter '${tagDelimiter}' cannot occur in or overlap tag '${entity.tagName}' for ${entity.name}`,
      );
    } else if (tagDelimiter === "" && !/^[a-z]+$/i.test(entity.tagName)) {
      throw new Error(`Delimiterless ids require an alphabetic tag, got '${entity.tagName}' for ${entity.name}`);
    } else if (
      tagDelimiter === "" &&
      entity.primaryKey.columnType !== "int" &&
      entity.primaryKey.columnType !== "bigint"
    ) {
      throw new Error(
        `Delimiterless ids require an int or bigint primary key, got '${entity.primaryKey.columnType}' for ${entity.name}`,
      );
    }
  }
}

if (typeof module !== "undefined" && require.main === module) {
  joistCodegen()
    .then(() => maybeSetExitCode())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
