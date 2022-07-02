import { camelCase } from "change-case";
import { CodeGenFile, EnumMetadata } from "joist-codegen";
import { code, imp } from "ts-poet";

/** Generates a `src/resolvers/enumResolvers.ts` with a resolver for each of our domain's "enum detail" types. */
export function generateEnumDetailResolvers(enums: EnumMetadata): CodeGenFile {
  const enumNames = Object.values(enums).map(({ name }) => name);

  const resolvers = Object.values(enums).map(({ name, extraPrimitives }) => {
    return code`
      ${name}Detail: {
        code: (root) => root.code,
        name: (root) => root.name,
        ${extraPrimitives
          .map((p) => camelCase(p.columnName))
          .map((fieldName) => code`${fieldName}: (root) => root.${fieldName},`)}
      },
    `;
  });

  const Resolvers = imp("Resolvers@src/generated/graphql-types");

  const contents = code`
    type EnumDetails = ${enumNames.map((n) => `"${n}Detail"`).join(" | ")};

    export const enumResolvers: Pick<${Resolvers}, EnumDetails> = {
      ${resolvers}
    };
  `;

  return { name: "../resolvers/enumResolvers.ts", overwrite: true, contents };
}
