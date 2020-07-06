import { promises as fs } from "fs";
import { newPgConnectionConfig } from "joist-utils";
import { Client } from "pg";
import pgStructure, { Db, Table } from "pg-structure";
import { code, Code } from "ts-poet";
import { assignTags } from "./assignTags";
import { Config, loadConfig, writeConfig } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { generateEntitiesFile } from "./generateEntitiesFile";
import { generateEntityCodegenFile } from "./generateEntityCodegenFile";
import { generateEnumFile } from "./generateEnumFile";
import { generateFactoriesFiles } from "./generateFactoriesFiles";
import { generateInitialEntityFile } from "./generateInitialEntityFile";
import { generateMetadataFile } from "./generateMetadataFile";
import { configureMetadata } from "./symbols";
import { isEntityTable, isEnumTable, merge, tableToEntityName, trueIfResolved } from "./utils";

export { EntityDbMetadata };

export interface CodeGenFile {
  name: string;
  contents: Code | string;
  overwrite: boolean;
}

/** A map from Enum table name to the rows currently in the table. */
export type EnumRows = Record<string, EnumRow[]>;
export type EnumRow = { id: number; code: string; name: string };

/** Uses entities and enums from the `db` schema and saves them into our entities directory. */
export async function generateAndSaveFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  const files = generateFiles(config, dbMeta);
  await fs.mkdir(config.entitiesDirectory, { recursive: true });
  for await (const file of files) {
    const path = `${config.entitiesDirectory}/${file.name}`;
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
export function generateFiles(config: Config, dbMeta: DbMetadata): CodeGenFile[] {
  const { entities, enumTables: enums, enumRows } = dbMeta;
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

  const enumFiles = enums
    .map((table) => {
      const enumName = tableToEntityName(table);
      return [{ name: `${enumName}.ts`, contents: generateEnumFile(table, enumRows, enumName), overwrite: true }];
    })
    .reduce(merge, []);

  const metadataFile: CodeGenFile = {
    name: "./metadata.ts",
    contents: code`
      ${entities.map((meta) => generateMetadataFile(config, meta))}

      const allMetadata = [${entities.map((meta) => meta.entity.metaName).join(", ")}];
      ${configureMetadata}(allMetadata);
    `,
    overwrite: true,
  };

  const entitiesFile: CodeGenFile = {
    name: "./entities.ts",
    contents: generateEntitiesFile(entities, enums),
    overwrite: true,
  };

  const factoriesFiles: CodeGenFile[] = generateFactoriesFiles(entities);

  const indexFile: CodeGenFile = {
    name: "./index.ts",
    contents: code`export * from "./entities"`,
    overwrite: false,
  };

  // Look for modules to require and call the exported `.run(EntityDbMetadata[], Table[])` method
  const pluginFiles: CodeGenFile[] = config.codegenPlugins
    .map((p) => {
      const plugin = require(p);
      return plugin.run(entities, enumRows);
    })
    .flat();

  return [...entityFiles, ...enumFiles, entitiesFile, ...factoriesFiles, metadataFile, indexFile, ...pluginFiles];
}

export async function loadEnumRows(db: Db, client: Client): Promise<EnumRows> {
  const promises = db.tables.filter(isEnumTable).map(async (table) => {
    const result = await client.query(`SELECT * FROM ${table.name} ORDER BY id`);
    const rows = result.rows.map((row) => ({ id: row.id, code: row.code, name: row.name } as EnumRow));
    return [table.name, rows] as [string, EnumRow[]];
  });
  return Object.fromEntries(await Promise.all(promises));
}

export async function contentToString(content: Code | string, fileName: string): Promise<string> {
  if (typeof content === "string") {
    return content;
  }
  return await content.toStringWithImports(fileName);
}

if (require.main === module) {
  if (Object.fromEntries === undefined) {
    throw new Error("Joist requires Node v12.4.0+");
  }
  (async function () {
    const pgConfig = newPgConnectionConfig();
    const db = await pgStructure(pgConfig);

    const client = new Client(pgConfig);
    await client.connect();
    const enumRows = await loadEnumRows(db, client);
    await client.end();

    const config = await loadConfig();

    const entityTables = db.tables.filter(isEntityTable).sortBy("name");
    const enumTables = db.tables.filter(isEnumTable).sortBy("name");
    const entities = entityTables.map((table) => new EntityDbMetadata(config, table));
    const dbMetadata: DbMetadata = { entityTables, enumTables, entities, enumRows };

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
  enumTables: Table[];
  entities: EntityDbMetadata[];
  enumRows: EnumRows;
}
