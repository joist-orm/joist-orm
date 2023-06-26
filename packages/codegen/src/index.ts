import { newPgConnectionConfig } from "joist-utils";
import { Client } from "pg";
import pgStructure from "pg-structure";
import { saveFiles } from "ts-poet";
import { DbMetadata, EntityDbMetadata } from "./EntityDbMetadata";
import { assignTags } from "./assignTags";
import { Config, loadConfig, writeConfig } from "./config";
import { generateFiles } from "./generate";
import { createFlushFunction } from "./generateFlushFunction";
import { loadEnumMetadata, loadPgEnumMetadata } from "./loadMetadata";
import { isEntityTable, mapSimpleDbTypeToTypescriptType } from "./utils";

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

/** Uses entities and enums from the `db` schema and saves them into our entities directory. */
export async function generateAndSaveFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  const files = await generateFiles(config, dbMeta);
  await saveFiles({
    toolName: "joist-codegen",
    directory: config.entitiesDirectory,
    files,
  });

  if (config.docGen) {
    const { tsDocIntegrate } = require("joist-doc");
    await tsDocIntegrate(config, dbMeta);
  }
}

if (require.main === module) {
  if (Object.fromEntries === undefined) {
    throw new Error("Joist requires Node v12.4.0+");
  }
  (async function () {
    const config = await loadConfig();

    maybeSetDatabaseUrl(config);
    const pgConfig = newPgConnectionConfig();
    // Assume other schemas are things like cyan audit / graphile-worker, that we don't want entity for
    const db = await pgStructure(pgConfig, { includeSchemas: "public" });

    const client = new Client(pgConfig);
    await client.connect();
    const enums = await loadEnumMetadata(db, client, config);
    const pgEnums = await loadPgEnumMetadata(db, client, config);

    const entityTables = db.tables.filter((t) => isEntityTable(config, t)).sortBy("name");
    const entities = entityTables.map((table) => new EntityDbMetadata(config, table, enums));

    const dbMetadata: DbMetadata = { entityTables, entities, enums, pgEnums };
    console.log(
      `Found ${db.tables.length} total tables, ${entityTables.length} entity tables, ${
        Object.entries(enums).length
      } enum tables`,
    );

    // In graphql-service we have our own custom flush function, so allow skipping this
    if (config.createFlushFunction !== false) {
      if (Array.isArray(config.createFlushFunction)) {
        console.log("Creating flush_database functions");
        await Promise.all(
          config.createFlushFunction.map(async (dbName) => {
            const client = new Client({ ...pgConfig, database: dbName });
            await client.connect();
            await createFlushFunction(db, client, config);
            await client.end();
          }),
        );
      } else {
        console.log("Creating flush_database function");
        await createFlushFunction(db, client, config);
      }
    }

    await client.end();

    assignTags(config, dbMetadata);
    await writeConfig(config);

    await generateAndSaveFiles(config, dbMetadata);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

function maybeSetDatabaseUrl(config: Config): void {
  if (!process.env.DATABASE_URL && config.databaseUrl) {
    process.env.DATABASE_URL = config.databaseUrl;
  }
}
