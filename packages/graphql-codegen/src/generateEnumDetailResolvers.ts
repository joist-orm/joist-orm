import { pascalCase } from "change-case";
import { CodeGenFile, EnumRows } from "joist-codegen";
import pluralize from "pluralize";
import { code, imp } from "ts-poet";

/** Generates a `src/resolvers/enumResolvers.ts` with a resolver for each of our domain's "enum detail" types. */
export function generateEnumDetailResolvers(enums: EnumRows): CodeGenFile {
  const enumNames = Object.keys(enums).map((name) => pascalCase(name));

  const resolvers = enumNames.map((name) => {
    const type = imp(`${pluralize(name)}@@src/entities`);
    return code`
      ${name}Detail: {
        code: (root) => root,
        name: (root) => ${type}.getByCode(root).name,
      },
    `;
  });

  const Resolvers = imp("Resolvers@@src/generated/graphql-types");

  const contents = code`
    type EnumDetails = ${enumNames.map((n) => `"${n}Detail"`).join(" | ")};

    export const enumResolvers: Pick<${Resolvers}, EnumDetails> = {
      ${resolvers}
    };
  `;

  return { name: "../resolvers/enumResolvers.ts", overwrite: true, contents };
}
