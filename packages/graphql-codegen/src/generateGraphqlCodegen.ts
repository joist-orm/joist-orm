import { Config, EntityDbMetadata, EnumMetadata } from "joist-codegen";
import { CodegenFile, code } from "ts-poet";
import { getEntitiesImportPath } from "./utils";

/** Generates a `graphql-codegen-joist.js` (or .mjs for ESM) with the auto-generated mapped type/enum value settings. */
export function generateGraphqlCodegen(config: Config, entities: EntityDbMetadata[], enums: EnumMetadata): CodegenFile {
  const enumNames = Object.values(enums).map(({ name }) => name);

  // Combine the entity mapped types and enum detail mapped types
  const entitiesMapperImportPath = getEntitiesImportPath(config).replace(/\.ts$/, ""); // Keep compatibility with the expected mapper format (no file extension)
  const mappedTypes = sortObject(
    Object.fromEntries([
      ...entities.map(({ entity }) => [entity.name, `${entitiesMapperImportPath}#${entity.name}`]),
      ...enumNames.map((name) => [`${name}Detail`, `${entitiesMapperImportPath}#${name}`]),
    ]),
  );

  const contents = config.esm
    ? code`
        export const mappers = {
          ${Object.entries(mappedTypes).map(([key, value]) => `${key}: "${value}",`)}
        };

        export const enumValues = {
          ${enumNames.map((name) => `${name}: "${entitiesMapperImportPath}#${name}",`)}
        };
      `
    : code`
        const mappers = {
          ${Object.entries(mappedTypes).map(([key, value]) => `${key}: "${value}",`)}
        };

        const enumValues = {
          ${enumNames.map((name) => `${name}: "${entitiesMapperImportPath}#${name}",`)}
        };

        module.exports = { mappers, enumValues };
      `;

  const ext = config.esm ? "mjs" : "js";
  return { name: `../../graphql-codegen-joist.${ext}`, overwrite: true, contents };
}

function sortObject<T extends object>(obj: T): T {
  return Object.keys(obj)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key as keyof T] = obj[key as keyof T];
        return acc;
      },
      {} as any as T,
    ) as T;
}
