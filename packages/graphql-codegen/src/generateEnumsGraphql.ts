import { camelCase } from "change-case";
import { CodeGenFile, EnumMetadata } from "joist-codegen";
import { formatGraphQL, mapTypescriptTypeToGraphQLType } from "./graphqlUtils";

/** Generates a `schema/enums.graphql` with GQL enums that match all of our domain enums. */
export async function generateEnumsGraphql(enums: EnumMetadata): Promise<CodeGenFile> {
  const contents = Object.values(enums)
    .map(({ name, rows, extraPrimitives }) => {
      const enumDecl = `enum ${name} { ${rows.map((r) => r.code).join(" ")} }`;
      const detailDecl = `type ${name}Detail { code: ${name}! name: String! ${extraPrimitives
        .map((p) => `${camelCase(p.columnName)}: ${mapTypescriptTypeToGraphQLType(p.fieldName, p.fieldType)}!`)
        .join(" ")} }`;
      return [enumDecl, "", detailDecl, ""];
    })
    .flat()
    .join("\n");

  const formatted = await formatGraphQL(contents);

  return { name: "../../schema/enums.graphql", overwrite: true, contents: formatted };
}
