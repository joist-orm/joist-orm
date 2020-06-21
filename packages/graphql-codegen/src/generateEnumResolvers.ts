import { pascalCase } from "change-case";
import { CodeGenFile, EnumRows } from "joist-codegen";
import pluralize from "pluralize";
import { code, imp } from "ts-poet";

/** Generates a `src/resolvers/enumResolvers.ts` with a resolver for each of our domain's "enum detail" types. */
export function generateEnumResolvers(enums: EnumRows): CodeGenFile {
  const resolvers = Object.entries(enums).map(([_name, rows]) => {
    const name = pascalCase(_name);
    const type = imp(`${pluralize(name)}@@src/entities`);
    return code`
        ${name}: {
          code: (root) => root,
          name: (root) => ${type}.getByCode(root).name,
        },
      `;
  });

  const Resolvers = imp("Resolvers@@src/generated/graphql-types");

  const contents = code`
    type Enums = ${Object.keys(enums)
      .map((n) => `"${pascalCase(n)}"`)
      .join(" | ")};

    export const enumResolvers: Pick<${Resolvers}, Enums> = {
      ${resolvers}
    };
  `;

  return { name: "../resolvers/enumResolvers.ts", overwrite: true, contents };
}
