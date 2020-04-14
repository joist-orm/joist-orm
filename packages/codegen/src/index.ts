import pgStructure, { Db } from "pg-structure";
import { promises as fs } from "fs";
import { Client } from "pg";
import { code, Code } from "ts-poet";
import { isEntityTable, isEnumTable, merge, tableToEntityName, trueIfResolved } from "./utils";
import { newPgConnectionConfig } from "./connection";
import { generateMetadataFile } from "./generateMetadataFile";
import { generateEntitiesFile } from "./generateEntitiesFile";
import { generateEnumFile } from "./generateEnumFile";
import { generateEntityCodegenFile } from "./generateEntityCodegenFile";
import { generateInitialEntityFile } from "./generateInitialEntityFile";

export interface CodeGenFile {
  name: string;
  contents: Code | string;
  overwrite: boolean;
}

/** A map from Enum table name to the rows currently in the table. */
export type EnumRows = Record<string, EnumRow[]>;
export type EnumRow = { id: number; code: string; name: string };

export interface Config {
  entitiesDirectory: string;
  derivedFields: string[];
}

const defaultConfig: Config = {
  entitiesDirectory: "./src/entities",
  derivedFields: [],
};

/** Uses entities and enums from the `db` schema and saves them into our entities directory. */
export async function generateAndSaveFiles(config: Config, db: Db, enumRows: EnumRows): Promise<void> {
  const files = generateFiles(config, db, enumRows);
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
export function generateFiles(config: Config, db: Db, enumRows: EnumRows): CodeGenFile[] {
  const entities = db.tables.filter(isEntityTable).sortBy("name");
  const enums = db.tables.filter(isEnumTable).sortBy("name");

  const entityFiles = entities
    .map((table) => {
      const entityName = tableToEntityName(table);
      return [
        {
          name: `${entityName}Codegen.ts`,
          contents: generateEntityCodegenFile(config, table, entityName),
          overwrite: true,
        },
        { name: `${entityName}.ts`, contents: generateInitialEntityFile(table, entityName), overwrite: false },
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
    contents: code`${entities.map((table) => generateMetadataFile(config, table))}`,
    overwrite: true,
  };

  const entitiesFile: CodeGenFile = {
    name: "./entities.ts",
    contents: generateEntitiesFile(entities, enums),
    overwrite: true,
  };

  const indexFile: CodeGenFile = {
    name: "./index.ts",
    contents: code`export * from "./entities"`,
    overwrite: false,
  };

  return [...entityFiles, ...enumFiles, entitiesFile, metadataFile, indexFile];
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

async function loadConfig(): Promise<Config> {
  const configPath = "./joist-codegen.json";
  const exists = await trueIfResolved(fs.access(configPath));
  if (exists) {
    const content = await fs.readFile(configPath);
    return { ...defaultConfig, ...(JSON.parse(content.toString()) as Config) };
  }
  return defaultConfig;
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
    await generateAndSaveFiles(config, db, enumRows);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
