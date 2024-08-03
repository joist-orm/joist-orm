import { ConnectionConfig, newPgConnectionConfig } from "joist-utils";
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

async function main() {
  const config = await loadConfig();

  maybeSetDatabaseUrl(config);
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

  // Scan `*.ts` files after we've expanded `Task` -> `TaskOld.ts`
  await scanEntityFiles(config, dbMetadata);

  // If we're not using deferred FKs, determine our DAG insert order
  const hasError = await maybeSetForeignKeyOrdering(config, dbMetadata.entities);

  // Generate the flush function for tests
  await maybeGenerateFlushFunctions(config, client, pgConfig, dbMetadata);

  await client.end();

  // Apply any codemods to the user's codebase, if we have them
  await maybeRunTransforms(config);

  // Assign any new tags and write them back to the config file
  assignTags(config, dbMetadata);

  // Do some warnings
  for (const entity of entities) failIfOverlappingFieldNames(entity);
  warnInvalidConfigEntries(config, dbMetadata);

  // Finally actually generate the files (even if we found a fatal error)
  await generateAndSaveFiles(config, dbMetadata);

  stripStiPlaceholders(config, entities);
  await writeConfig(config);

  if (hasError) {
    throw new Error("A fatal error was found during codegen");
  }
}

/** Uses entities and enums from the `db` schema and saves them into our entities directory. */
export async function generateAndSaveFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  const files = await generateFiles(config, dbMeta);
  await saveFiles({
    toolName: "joist-codegen",
    directory: config.entitiesDirectory,
    files,
    toStringOpts: { importExtensions: config.esm ? "js" : false },
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

if (require.main === module) {
  if (Object.fromEntries === undefined) {
    throw new Error("Joist requires Node v12.4.0+");
  }
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
