import { ConnectionConfig, newPgConnectionConfig } from "joist-utils";
import { Client } from "pg";
import pgStructure from "pg-structure";
import { saveFiles } from "ts-poet";
import { DbMetadata, EntityDbMetadata, failIfOverlappingFieldNames } from "./EntityDbMetadata";
import { assignTags } from "./assignTags";
import { maybeRunTransforms } from "./codemods";
import { Config, loadConfig, warnInvalidConfigEntries, writeConfig } from "./config";
import { generateFiles } from "./generate";
import { createFlushFunction } from "./generateFlushFunction";
import { loadEnumMetadata, loadPgEnumMetadata } from "./loadMetadata";
import { isEntityTable, isJoinTable, mapSimpleDbTypeToTypescriptType } from "./utils";

export {
  DbMetadata,
  EnumField,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
  PrimitiveField,
  PrimitiveTypescriptType,
  makeEntity,
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

  await maybeGenerateFlushFunctions(config, client, pgConfig, dbMetadata);
  await client.end();

  await maybeRunTransforms(config);

  // Assign any new tags and write them back to the config file
  assignTags(config, dbMetadata);
  // bumpVersion(config);
  await writeConfig(config);

  // Do some warnings
  for (const entity of entities) failIfOverlappingFieldNames(entity);
  warnInvalidConfigEntries(config, dbMetadata);
  const loggedFatal = errorOnInvalidDeferredFKs(entities);

  // Finally actually generate the files (even if we found a fatal error)
  await generateAndSaveFiles(config, dbMetadata);

  if (loggedFatal) {
    throw new Error("A warning was generated during codegen");
  }
}

/** Uses entities and enums from the `db` schema and saves them into our entities directory. */
export async function generateAndSaveFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  const files = await generateFiles(config, dbMeta);
  await saveFiles({
    toolName: "joist-codegen",
    directory: config.entitiesDirectory,
    files,
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
  // Assume other schemas are things like cyanaudit/graphile-worker, that we don't want entity for
  const db = await pgStructure(client, { includeSchemas: "public" });
  const enums = await loadEnumMetadata(db, client, config);
  const pgEnums = await loadPgEnumMetadata(db, client, config);
  const entities = db.tables
    .filter((t) => isEntityTable(config, t))
    .sortBy("name")
    .map((table) => new EntityDbMetadata(config, table, enums));
  const totalTables = db.tables.length;
  const joinTables = db.tables.filter((t) => isJoinTable(config, t)).map((t) => t.name);
  return { entities, enums, pgEnums, totalTables, joinTables };
}

function maybeSetDatabaseUrl(config: Config): void {
  if (!process.env.DATABASE_URL && config.databaseUrl) {
    process.env.DATABASE_URL = config.databaseUrl;
  }
}

function errorOnInvalidDeferredFKs(entities: EntityDbMetadata[]): boolean {
  let hasError = false;
  for (const entity of entities) {
    for (const m2o of entity.manyToOnes) {
      if (!m2o.isDeferredAndDeferrable) {
        console.error(
          `ERROR: Foreign key on ${m2o.columnName} is not DEFERRABLE/INITIALLY DEFERRED, see https://joist-orm.io/docs/getting-started/schema-assumptions#deferred-constraints`,
        );
        hasError ??= true;
      }
    }
  }
  return hasError;
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
