import { ConnectionConfig, newPgConnectionConfig } from "joist-utils";
import process from "node:process";
import { Client } from "pg";
import pgStructure from "pg-structure";
import { saveFiles } from "ts-poet";
import { DbMetadata, EntityDbMetadata, failIfOverlappingFieldNames } from "./EntityDbMetadata";
import { assignTags } from "./assignTags";
import { maybeRunTransforms } from "./codemods";
import { Config, loadConfig, stripStiPlaceholders, warnInvalidConfigEntries, writeConfig } from "./config";
import { maybeSetForeignKeyOrdering } from "./foreignKeyOrdering";
import { generateFiles } from "./generate";
import { createFlushFunction } from "./generateFlushFunction";
import { applyInheritanceUpdates } from "./inheritance";
import { loadEnumMetadata, loadPgEnumMetadata } from "./loadMetadata";
import { LOG_LEVELS, loggerMaxWarningLevelHit } from "./logger";
import { scanEntityFiles } from "./scanEntityFiles";
import { isEntityTable, isJoinTable, mapSimpleDbTypeToTypescriptType } from "./utils";

export {
  DbMetadata,
  EnumField,
  makeEntity,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
  PrimitiveField,
  PrimitiveTypescriptType,
} from "./EntityDbMetadata";
export { EnumMetadata, EnumRow, EnumTableData, PgEnumData, PgEnumMetadata } from "./loadMetadata";
export { Config, EntityDbMetadata, mapSimpleDbTypeToTypescriptType };
export { sqliteCodegen, SqliteCodegenOptions } from "./sqliteCodegen";

export async function joistCodegen() {
  const config = await loadConfig();

  maybeSetDatabaseUrl(config);
  if (!process.env.DATABASE_URL && !process.env.DB_USER) {
    console.log(`Database connection information not found, please set either:`);
    console.log(`  - the DATABASE_URL env variable (i.e. using .env and dotenv), or`);
    console.log(`  - the databaseUrl key in joist-config.json`);
    return;
  }
  const pgConfig = newPgConnectionConfig();

  const client = new Client(pgConfig);
  await client.connect();

  const dbMetadata = await loadSchemaMetadata(config, client);
  const { entities, enums, totalTables } = dbMetadata;
  console.log(
    `Found ${totalTables} total tables, ${entities.length} entity tables, ${Object.entries(enums).length} enum tables`,
  );
  console.log("");

  // Look for STI tables to synthesize separate metas
  applyInheritanceUpdates(config, dbMetadata);

  // Assign any new tags and write them back to the config file
  assignTags(config, dbMetadata);

  // Scan `*.ts` files after we've expanded `Task` -> `TaskOld.ts`
  await scanEntityFiles(config, dbMetadata);

  // If we're not using deferred FKs, determine our DAG insert order
  await maybeSetForeignKeyOrdering(config, dbMetadata.entities);

  // Generate the flush function for tests
  await maybeGenerateFlushFunctions(config, client, pgConfig, dbMetadata);

  await client.end();

  // Apply any codemods to the user's codebase, if we have them
  await maybeRunTransforms(config);

  // Do some warnings
  for (const entity of entities) failIfOverlappingFieldNames(entity);
  warnInvalidConfigEntries(config, dbMetadata);

  // Finally actually generate the files (even if we found a fatal error)
  await generateAndSaveFiles(config, dbMetadata);

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

async function loadSchemaMetadata(config: Config, client: Client): Promise<DbMetadata> {
  // Here we load all schemas, to avoid pg-structure failing on cross-schema foreign keys
  // like our cyanaudit triggers (https://github.com/ozum/pg-structure/issues/85), and then
  // later filter them non-public schema tables out.
  const db = await pgStructure(client);
  const enums = await loadEnumMetadata(db, client, config);
  const pgEnums = await loadPgEnumMetadata(db, client, config);
  const entities = db.tables
    .filter((t) => isEntityTable(config, t))
    .sortBy("name")
    .map((table) => new EntityDbMetadata(config, table, enums));
  const totalTables = db.tables.length;
  const joinTables = db.tables.filter((t) => isJoinTable(config, t)).map((t) => t.name);
  const entitiesByName = Object.fromEntries(entities.map((e) => [e.name, e]));
  return { entities, entitiesByName, enums, pgEnums, totalTables, joinTables };
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

if (require.main === module) {
  joistCodegen()
    .then(() => maybeSetExitCode())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
