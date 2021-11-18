import { pascalCase } from "change-case";
import { configureAggregateRoots } from "configureAggregateRoots";
import { promises as fs } from "fs";
import { newPgConnectionConfig } from "joist-utils";
import { dirname } from "path";
import { Client } from "pg";
import pgStructure, { Db, Table } from "pg-structure";
import { code, Code, def, imp } from "ts-poet";
import { assignTags } from "./assignTags";
import { Config, loadConfig, writeConfig } from "./config";
import { EntityDbMetadata, PrimitiveField } from "./EntityDbMetadata";
import { generateEntitiesFile } from "./generateEntitiesFile";
import { generateEntityCodegenFile } from "./generateEntityCodegenFile";
import { generateEnumFile } from "./generateEnumFile";
import { generateFactoriesFiles } from "./generateFactoriesFiles";
import { generateInitialEntityFile } from "./generateInitialEntityFile";
import { generateMetadataFile } from "./generateMetadataFile";
import { configureMetadata, EntityManager } from "./symbols";
import {
  isEntityTable,
  isEnumTable,
  mapSimpleDbTypeToTypescriptType,
  merge,
  tableToEntityName,
  trueIfResolved,
} from "./utils";

export {
  EnumField,
  makeEntity,
  ManyToManyField,
  ManyToOneField,
  OneToManyField,
  OneToOneField,
  PrimitiveField,
} from "./EntityDbMetadata";
export { Config, EntityDbMetadata, mapSimpleDbTypeToTypescriptType };

export interface CodeGenFile {
  name: string;
  contents: Code | string;
  overwrite: boolean;
}

/** A map from Enum table name to the rows currently in the table. */
export type EnumTableData = {
  table: Table;
  // Pascal case version of table name
  name: string;
  rows: EnumRow[];
  extraPrimitives: PrimitiveField[];
};
export type EnumMetadata = Record<string, EnumTableData>;
export type EnumRow = { id: number; code: string; name: string; [key: string]: any };

/** Uses entities and enums from the `db` schema and saves them into our entities directory. */
export async function generateAndSaveFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  const files = await generateFiles(config, dbMeta);
  for await (const file of files) {
    const path = `${config.entitiesDirectory}/${file.name}`;
    // We might be writing to a non-entities directory i.e. for the graphql plugin, so check this for each file
    await fs.mkdir(dirname(path), { recursive: true });
    if (file.overwrite) {
      await fs.writeFile(path, await contentToString(file.contents, file.name));
    } else {
      const exists = await trueIfResolved(fs.access(path));
      if (!exists) {
        await fs.writeFile(path, await contentToString(file.contents, file.name));
      }
    }
  }
}

/** Generates our `${Entity}` and `${Entity}Codegen` files based on the `db` schema. */
export async function generateFiles(config: Config, dbMeta: DbMetadata): Promise<CodeGenFile[]> {
  const { entities, enums } = dbMeta;
  const entityFiles = entities
    .map((meta) => {
      const entityName = meta.entity.name;
      return [
        {
          name: `${entityName}Codegen.ts`,
          contents: generateEntityCodegenFile(config, meta),
          overwrite: true,
        },
        { name: `${entityName}.ts`, contents: generateInitialEntityFile(meta), overwrite: false },
      ];
    })
    .reduce(merge, []);

  const enumFiles = Object.values(enums)
    .map((enumData) => {
      const enumName = tableToEntityName(config, enumData.table);
      return [
        {
          name: `${enumName}.ts`,
          contents: generateEnumFile(config, enumData, enumName),
          overwrite: true,
        },
      ];
    })
    .reduce(merge, []);

  const contextType = config.contextType ? imp(config.contextType) : "{}";
  const BaseEntity = imp("BaseEntity@joist-orm");

  const metadataFile: CodeGenFile = {
    name: "./metadata.ts",
    contents: code`
      export class ${def("EntityManager")} extends ${EntityManager}<${contextType}> {}

      export function getEm(e: ${BaseEntity}): EntityManager {
        return e.__orm.em as EntityManager;
      }

      ${entities.map((meta) => generateMetadataFile(config, meta))}

      export const allMetadata = [${entities.map((meta) => meta.entity.metaName).join(", ")}];
      ${configureMetadata}(allMetadata);
    `,
    overwrite: true,
  };

  const enumsTables = Object.values(enums)
    .map(({ table }) => table)
    .sort((a, b) => a.name.localeCompare(b.name));

  const entitiesFile: CodeGenFile = {
    name: "./entities.ts",
    contents: generateEntitiesFile(config, entities, enumsTables),
    overwrite: true,
  };

  const factoriesFiles: CodeGenFile[] = generateFactoriesFiles(entities);

  const indexFile: CodeGenFile = {
    name: "./index.ts",
    contents: code`export * from "./entities"`,
    overwrite: false,
  };

  // Look for modules to require and call the exported `.run(EntityDbMetadata[], Table[])` method

  const pluginFiles: CodeGenFile[] = (
    await Promise.all(
      config.codegenPlugins.map((p) => {
        const plugin = require(p);
        return plugin.run(config, entities, enums);
      }),
    )
  ).flat();

  return [...entityFiles, ...enumFiles, entitiesFile, ...factoriesFiles, metadataFile, indexFile, ...pluginFiles];
}

export async function loadEnumMetadata(db: Db, client: Client, config: Config): Promise<EnumMetadata> {
  const promises = db.tables.filter(isEnumTable).map(async (table) => {
    const result = await client.query(`SELECT * FROM ${table.name} ORDER BY id`);
    const rows = result.rows.map((row) => row as EnumRow);
    // We're not really an entity, but appropriate EntityDbMetadata's `primitives` filtering
    const extraPrimitives = new EntityDbMetadata(config, table).primitives.filter(
      (p) => !["code", "name"].includes(p.fieldName),
    );
    return [
      table.name,
      {
        table,
        name: pascalCase(table.name), // use tableToEntityName?
        rows,
        extraPrimitives,
      },
    ] as [string, EnumTableData];
  });
  return Object.fromEntries(await Promise.all(promises));
}

export async function contentToString(content: Code | string, fileName: string): Promise<string> {
  if (typeof content === "string") {
    return content;
  }
  return await content.toStringWithImports({ path: fileName });
}

if (require.main === module) {
  if (Object.fromEntries === undefined) {
    throw new Error("Joist requires Node v12.4.0+");
  }
  (async function () {
    const pgConfig = newPgConnectionConfig();
    // Assume other schemas are things like cyan audit / graphile-worker, that we don't want entity for
    const db = await pgStructure(pgConfig, { includeSchemas: "public" });

    const config = await loadConfig();

    const client = new Client(pgConfig);
    await client.connect();
    const enums = await loadEnumMetadata(db, client, config);
    await client.end();

    const entityTables = db.tables.filter(isEntityTable).sortBy("name");
    const entities = entityTables.map((table) => new EntityDbMetadata(config, table, enums));

    const dbMetadata: DbMetadata = { entityTables, entities, enums };

    configureAggregateRoots(entities);
    assignTags(config, dbMetadata);
    await writeConfig(config);

    await generateAndSaveFiles(config, dbMetadata);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export interface DbMetadata {
  entityTables: Table[];
  entities: EntityDbMetadata[];
  enums: EnumMetadata;
}
