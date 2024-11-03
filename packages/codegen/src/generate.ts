import { readdir } from "fs/promises";
import { code, CodegenFile, def, imp } from "ts-poet";
import { generateEntitiesFile } from "./generateEntitiesFile";
import { generateEntityCodegenFile, getIdType } from "./generateEntityCodegenFile";
import { generateEntityFile } from "./generateEntityFile";
import { generateEntityTestFile } from "./generateEntityTestFile";
import { generateEnumFile } from "./generateEnumFile";
import { generateFactoriesFiles } from "./generateFactoriesFiles";
import { generateMetadataFile } from "./generateMetadataFile";
import { generatePgEnumFile } from "./generatePgEnumFile";
import { Config, DbMetadata } from "./index";
import { configureMetadata, Entity, JoistEntityManager } from "./symbols";
import { merge, tableToEntityName } from "./utils";

export type DPrintOptions = Record<string, unknown>;

/**
 * Provides an API for hooking into the codegen build step.
 */
export interface CodegenPlugin {
  run(config: Config, dbMeta: DbMetadata): Promise<CodegenFile>;
}

/** Generates our `${Entity}` and `${Entity}Codegen` files based on the `db` schema. */
export async function generateFiles(config: Config, dbMeta: DbMetadata): Promise<CodegenFile[]> {
  const { entities, enums, pgEnums } = dbMeta;

  // Find existing entities so that, besides just using `overwrite: false`, we can completely
  // skip making test files except for the _first_ time we create an entity. This achieves
  // `.history`-like "create once" behavior without the need for the `.history` file.
  const files = await readExistingFiles(config);

  const entityFiles = entities
    .map((meta) => {
      const entityName = meta.entity.name;
      const hasEntityFile = files.includes(`${entityName}.ts`);
      return [
        {
          name: `./codegen/${entityName}Codegen.ts`,
          contents: generateEntityCodegenFile(config, dbMeta, meta),
          overwrite: true,
        },
        ...(hasEntityFile
          ? []
          : [
              { name: `${entityName}.ts`, contents: generateEntityFile(config, meta), overwrite: false },
              { name: `${entityName}.test.ts`, contents: generateEntityTestFile(config, meta), overwrite: false },
            ]),
      ];
    })
    .reduce(merge, []);

  const enumFiles = Object.values(enums)
    .map((enumData) => {
      const enumName = tableToEntityName(config, enumData.table);
      return [
        {
          name: `./enums/${enumName}.ts`,
          contents: generateEnumFile(config, enumData, enumName),
          overwrite: true,
        },
      ];
    })
    .reduce(merge, []);
  const pgEnumFiles = Object.values(pgEnums)
    .map((enumData) => {
      return [
        {
          name: `./enums/${enumData.name}.ts`,
          contents: generatePgEnumFile(config, enumData),
          overwrite: true,
        },
      ];
    })
    .reduce(merge, []);

  const contextType = config.contextType ? imp(`t:${config.contextType}`) : "{}";

  const metadataFile: CodegenFile = {
    name: "./codegen/metadata.ts",
    contents: code`
      export class ${def("EntityManager")} extends ${JoistEntityManager}<${contextType}, Entity> {}

      export interface ${def("Entity")} extends ${Entity} {
        id: ${getIdType(config)};
        em: EntityManager;
      }

      ${entities.map((meta) => generateMetadataFile(config, dbMeta, meta))}

      export const allMetadata = [${entities.map((meta) => meta.entity.metaName).join(", ")}];
      ${configureMetadata}(allMetadata);
    `,
    overwrite: true,
    toStringOpts: { dprintOptions: { lineWidth: 400 } },
  };

  const enumsTables = Object.values(enums)
    .map(({ table }) => table)
    .sort((a, b) => a.name.localeCompare(b.name));

  const entitiesFile: CodegenFile = {
    name: "./entities.ts",
    contents: generateEntitiesFile(config, entities, enumsTables, Object.values(pgEnums)),
    overwrite: true,
    toStringOpts: { dprintOptions: { "module.sortExportDeclarations": "maintain" } },
  };

  const factoriesFiles: CodegenFile[] = generateFactoriesFiles(entities);

  const indexFile: CodegenFile = {
    name: "./index.ts",
    contents: code`export * from "./entities${config.esm ? ".js" : ""}"`,
    overwrite: false,
  };

  // Look for modules to require and call the exported `.run(Config, DbMeta)` method
  const pluginFiles: CodegenFile[] = (
    await Promise.all(
      (config.codegenPlugins ?? []).map((p) => {
        const plugin = require(p) as CodegenPlugin;
        return plugin.run(config, dbMeta);
      }),
    )
  ).flat();

  return [
    ...entityFiles,
    ...enumFiles,
    ...pgEnumFiles,
    entitiesFile,
    ...factoriesFiles,
    metadataFile,
    indexFile,
    ...pluginFiles,
  ];
}

/** Reads the `entitiesDirectory` but just ignores if it doesn't exist yet. */
async function readExistingFiles(config: Config): Promise<string[]> {
  try {
    return await readdir(config.entitiesDirectory);
  } catch (e) {
    return [];
  }
}
