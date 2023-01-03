import { camelCase } from "change-case";
import { EnumMetadata } from "joist-codegen";
import pluralize from "pluralize";
import { code, CodegenFile, imp } from "ts-poet";

/** Generates a `src/resolvers/enumResolvers.ts` with a resolver for each of our domain's "enum detail" types. */
export function generateEnumDetailResolvers(enums: EnumMetadata): CodegenFile {
  const enumNames = Object.values(enums).map(({ name }) => name);

  const resolvers = Object.values(enums).map(({ name, extraPrimitives }) => {
    const type = imp(`${pluralize(name)}@src/entities`);
    return code`
      ${name}Detail: {
        code: (root) => root,
        name: (root) => ${type}.getByCode(root).name,
        ${extraPrimitives
          .map((p) => camelCase(p.columnName))
          .map((fieldName) => code`${fieldName}: (root) => ${type}.getByCode(root).${fieldName},`)}
      },
    `;
  });

  const Resolvers = imp("Resolvers@src/generated/graphql-types");

  const contents = code`
    type EnumDetails = ${enumNames.length === 0 ? "never" : enumNames.map((n) => `"${n}Detail"`).join(" | ")};

    export const enumResolvers: Pick<${Resolvers}, EnumDetails> = {
      ${resolvers}
    };
  `;

  return { name: "../resolvers/enumResolvers.ts", overwrite: true, contents };
}
