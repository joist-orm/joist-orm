import { ConnectionConfig, newPgConnectionConfig } from "joist-utils";
import { Client } from "pg";
import pgStructure from "pg-structure";
import { saveFiles } from "ts-poet";
import { DbMetadata, EntityDbMetadata, failIfOverlappingFieldNames, makeEntity } from "./EntityDbMetadata";
import { assignTags } from "./assignTags";
import { maybeRunTransforms } from "./codemods";
import { Config, loadConfig, warnInvalidConfigEntries, writeConfig } from "./config";
import { generateFiles } from "./generate";
import { createFlushFunction } from "./generateFlushFunction";
import { loadEnumMetadata, loadPgEnumMetadata } from "./loadMetadata";
import { fail, isEntityTable, isJoinTable, mapSimpleDbTypeToTypescriptType } from "./utils";

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
  expandSingleTableInheritance(config, entities);
  rewriteSingleTableForeignKeys(config, entities);
  return { entities, enums, pgEnums, totalTables, joinTables };
}

/** Expands STI tables into multiple entities, so they get separate `SubTypeCodegen.ts` & `SubType.ts` files. */
function expandSingleTableInheritance(config: Config, entities: EntityDbMetadata[]): void {
  for (const entity of entities) {
    const [fieldName, stiField] =
      Object.entries(config.entities[entity.name]?.fields || {}).find(([, f]) => !!f.singleTableInheritance) ?? [];
    if (fieldName && stiField && stiField.singleTableInheritance) {
      entity.inheritanceType = "sti";
      // Ensure we have an enum field so that we can bake the STI discriminators into the metadata.ts file
      const enumField =
        entity.enums.find((e) => e.fieldName === fieldName) ??
        fail(`No enum column found for ${entity.name}.${fieldName}, which is required to use singleTableInheritance`);
      entity.stiDiscriminatorField = enumField.fieldName;
      for (const [enumCode, config] of Object.entries(stiField.singleTableInheritance)) {
        // Synthesize an entity for this STI sub-entity
        const subEntity: EntityDbMetadata = {
          name: config.entityName,
          entity: makeEntity(config.entityName),
          tableName: entity.tableName,
          primaryKey: entity.primaryKey,
          primitives: entity.primitives.filter((f) => config.fields.includes(f.fieldName)),
          enums: entity.enums.filter((f) => config.fields.includes(f.fieldName)),
          pgEnums: entity.pgEnums.filter((f) => config.fields.includes(f.fieldName)),
          manyToOnes: entity.manyToOnes.filter((f) => config.fields.includes(f.fieldName)),
          oneToManys: entity.oneToManys.filter((f) => config.fields.includes(f.fieldName)),
          largeOneToManys: entity.largeOneToManys.filter((f) => config.fields.includes(f.fieldName)),
          oneToOnes: entity.oneToOnes.filter((f) => config.fields.includes(f.fieldName)),
          manyToManys: entity.manyToManys.filter((f) => config.fields.includes(f.fieldName)),
          largeManyToManys: entity.largeManyToManys.filter((f) => config.fields.includes(f.fieldName)),
          polymorphics: entity.polymorphics.filter((f) => config.fields.includes(f.fieldName)),
          tagName: entity.tagName,
          createdAt: undefined,
          updatedAt: undefined,
          deletedAt: undefined,
          baseClassName: entity.name,
          inheritanceType: "sti",
          stiDiscriminatorValue: (
            enumField.enumRows.find((r) => r.code === enumCode) ??
            fail(`No enum row found for ${entity.name}.${fieldName}.${enumCode}`)
          ).id,
          abstract: false,
          invalidDeferredFK: false,
        };

        // Now strip all the subclass fields from the base class
        entity.primitives = entity.primitives.filter((f) => !config.fields.includes(f.fieldName));
        entity.enums = entity.enums.filter((f) => !config.fields.includes(f.fieldName));
        entity.pgEnums = entity.pgEnums.filter((f) => !config.fields.includes(f.fieldName));
        entity.manyToOnes = entity.manyToOnes.filter((f) => !config.fields.includes(f.fieldName));
        entity.oneToManys = entity.oneToManys.filter((f) => !config.fields.includes(f.fieldName));
        entity.largeOneToManys = entity.largeOneToManys.filter((f) => !config.fields.includes(f.fieldName));
        entity.oneToOnes = entity.oneToOnes.filter((f) => !config.fields.includes(f.fieldName));
        entity.manyToManys = entity.manyToManys.filter((f) => !config.fields.includes(f.fieldName));
        entity.largeManyToManys = entity.largeManyToManys.filter((f) => !config.fields.includes(f.fieldName));
        entity.polymorphics = entity.polymorphics.filter((f) => !config.fields.includes(f.fieldName));

        entities.push(subEntity);
      }
    }
  }
}

type StiEntityMap = Map<string, { base: EntityDbMetadata; subTypes: EntityDbMetadata[] }>;
let stiEntities: StiEntityMap;

export function getStiEntities(entities: EntityDbMetadata[]): StiEntityMap {
  if (stiEntities) return stiEntities;
  stiEntities = new Map();
  for (const entity of entities) {
    if (entity.inheritanceType === "sti" && entity.stiDiscriminatorField) {
      const base = entity;
      const subTypes = entities.filter((s) => s.baseClassName === entity.name && s !== entity);
      stiEntities.set(entity.name, { base, subTypes });
      // Allow looking up by subType name
      for (const subType of subTypes) {
        stiEntities.set(subType.name, { base, subTypes: [] });
      }
    }
  }
  return stiEntities;
}

/** Finds FKs pointing to the base table and, if configured, rewrites them to point to the sub-tables. */
function rewriteSingleTableForeignKeys(config: Config, entities: EntityDbMetadata[]): void {
  // See if we even have any STI tables
  const stiEntities = getStiEntities(entities);
  if (stiEntities.size === 0) return;
  for (const entity of entities) {
    for (const m2o of entity.manyToOnes) {
      const target = stiEntities.get(m2o.otherEntity.name);
      // See if the user has configured this to a different subtype
      const stiType = config.entities[entity.name]?.relations?.[m2o.fieldName]?.stiType;
      if (target && stiType) {
        const { subTypes } = target;
        m2o.otherEntity = (
          subTypes.find((s) => s.name === stiType) ??
          fail(`Could not find STI type '${stiType}' in ${subTypes.map((s) => s.name)}`)
        ).entity;
      }
    }
  }
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
