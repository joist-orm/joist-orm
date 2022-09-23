import { code, CodegenFile, def, imp } from "ts-poet";
import { generateEntitiesFile } from "./generateEntitiesFile";
import { generateEntityCodegenFile } from "./generateEntityCodegenFile";
import { generateEnumFile } from "./generateEnumFile";
import { generateFactoriesFiles } from "./generateFactoriesFiles";
import { generateInitialEntityFile } from "./generateInitialEntityFile";
import { generateMetadataFile } from "./generateMetadataFile";
import { generatePgEnumFile } from "./generatePgEnumFile";
import { Config, DbMetadata } from "./index";
import { configureMetadata, JoistEntityManager } from "./symbols";
import { merge, tableToEntityName } from "./utils";

export type DPrintOptions = Record<string, unknown>;

/** Generates our `${Entity}` and `${Entity}Codegen` files based on the `db` schema. */
export async function generateFiles(config: Config, dbMeta: DbMetadata): Promise<CodegenFile[]> {
  const { entities, enums, pgEnums } = dbMeta;
  const entityFiles = entities
    .map((meta) => {
      const entityName = meta.entity.name;
      return [
        {
          name: `${entityName}Codegen.ts`,
          contents: generateEntityCodegenFile(config, meta),
          overwrite: true,
          hash: true,
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
          hash: true,
        },
      ];
    })
    .reduce(merge, []);
  const pgEnumFiles = Object.values(pgEnums)
    .map((enumData) => {
      return [
        {
          name: `${enumData.name}.ts`,
          contents: generatePgEnumFile(config, enumData),
          overwrite: true,
          hash: true,
        },
      ];
    })
    .reduce(merge, []);

  const contextType = config.contextType ? imp(config.contextType) : "{}";
  const BaseEntity = imp("BaseEntity@joist-orm");

  const metadataFile: CodegenFile = {
    name: "./metadata.ts",
    contents: code`
      /** @ignore */
      export class ${def("EntityManager")} extends ${JoistEntityManager}<${contextType}> {}

      /** @ignore */
      export function getEm(e: ${BaseEntity}): EntityManager {
        return e.em as EntityManager;
      }

      ${entities.map((meta) => generateMetadataFile(config, dbMeta, meta))}

      /** @ignore */
      export const allMetadata = [${entities.map((meta) => meta.entity.metaName).join(", ")}];
      ${configureMetadata}(allMetadata);
    `,
    overwrite: true,
    hash: true,
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
    contents: code`export * from "./entities"`,
    overwrite: false,
  };

  // Look for modules to require and call the exported `.run(EntityDbMetadata[], Table[])` method

  const pluginFiles: CodegenFile[] = (
    await Promise.all(
      config.codegenPlugins.map((p) => {
        const plugin = require(p);
        return plugin.run(config, entities, enums);
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
