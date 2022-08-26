import { promises as fs } from "fs";
import { newPgConnectionConfig } from "joist-utils";
import { dirname } from "path";
import { Client } from "pg";
import pgStructure from "pg-structure";
import { Code } from "ts-poet";
import { assignTags } from "./assignTags";
import { Config, loadConfig, writeConfig } from "./config";
import { DbMetadata, EntityDbMetadata } from "./EntityDbMetadata";
import { DPrintOptions, generateFiles } from "./generate";
import { createFlushFunction } from "./generateFlushFunction";
import { loadEnumMetadata, loadPgEnumMetadata } from "./loadMetadata";
import { isEntityTable, mapSimpleDbTypeToTypescriptType, trueIfResolved } from "./utils";

export {
  DbMetadata,
  EnumField,
  makeEntity,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
  PrimitiveField,
} from "./EntityDbMetadata";
export { CodeGenFile } from "./generate";
export { EnumMetadata, EnumRow, EnumTableData, PgEnumData, PgEnumMetadata } from "./loadMetadata";
export { Config, EntityDbMetadata, mapSimpleDbTypeToTypescriptType };

/** Uses entities and enums from the `db` schema and saves them into our entities directory. */
export async function generateAndSaveFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  const files = await generateFiles(config, dbMeta);
  for await (const file of files) {
    const path = `${config.entitiesDirectory}/${file.name}`;
    // We might be writing to a non-entities directory i.e. for the graphql plugin, so check this for each file
    await fs.mkdir(dirname(path), { recursive: true });
    if (file.overwrite) {
      await fs.writeFile(path, await contentToString(file.contents, file.name, file.dprintOverrides));
    } else {
      const exists = await trueIfResolved(fs.access(path));
      if (!exists) {
        await fs.writeFile(path, await contentToString(file.contents, file.name, file.dprintOverrides));
      }
    }
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
      console.log("Creating flush_database function");
      await createFlushFunction(db, client, config);
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

export async function contentToString(
  content: Code | string,
  fileName: string,
  dprintOptions: DPrintOptions = {},
): Promise<string> {
  if (typeof content === "string") {
    return content;
  }
  return await content.toStringWithImports({ path: fileName, dprintOptions });
}

function maybeSetDatabaseUrl(config: Config): void {
  if (!process.env.DATABASE_URL && config.databaseUrl) {
    process.env.DATABASE_URL = config.databaseUrl;
  }
}
