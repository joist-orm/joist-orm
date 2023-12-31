import { EntityDbMetadata, EnumMetadata } from "joist-codegen";
import { CodegenFile, code } from "ts-poet";

/** Generates a `graphql-codegen-joist.js` with the auto-generated mapped type/enum value settings. */
export function generateGraphqlCodegen(entities: EntityDbMetadata[], enums: EnumMetadata): CodegenFile {
  const enumNames = Object.values(enums).map(({ name }) => name);

  // Combine the entity mapped types and enum detail mapped types
  const mappedTypes = sortObject(
    Object.fromEntries([
      ...entities.map(({ entity }) => [entity.name, `src/entities#${entity.name}`]),
      ...enumNames.map((name) => [`${name}Detail`, `src/entities#${name}`]),
    ]),
  );

  const contents = code`
    const mappers = {
      ${Object.entries(mappedTypes).map(([key, value]) => `${key}: "${value}",`)}
    };

    const enumValues = {
      ${enumNames.map((name) => `${name}: "src/entities#${name}",`)}
    };

    module.exports = { mappers, enumValues };
  `;

  return { name: "../../graphql-codegen-joist.js", overwrite: true, contents };
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
