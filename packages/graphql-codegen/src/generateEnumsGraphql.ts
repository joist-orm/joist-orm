import { camelCase } from "change-case";
import { EnumMetadata } from "joist-codegen";
import { CodegenFile } from "ts-poet";
import { formatGraphQL, isJsonbColumn, mapTypescriptTypeToGraphQLType, SupportedTypescriptTypes } from "./graphqlUtils";

/** Generates a `schema/enums.graphql` with GQL enums that match all of our domain enums. */
export async function generateEnumsGraphql(enums: EnumMetadata): Promise<CodegenFile> {
  const contents = Object.values(enums)
    .map(({ name, rows, extraPrimitives }) => {
      const enumDecl = `enum ${name} { ${rows.map((r) => r.code).join(" ")} }`;
      const detailDecl = `type ${name}Detail { code: ${name}! name: String! ${extraPrimitives
        // Not supporting jsonb columns in GraphQL enums for now...would be doable if we
        // add a jsonb type --> GQL type mapping, or maybe even created that GQL type ourselves
        // from a superstruct definition of the type.
        .filter((p) => !isJsonbColumn(p))
        .map(
          (p) =>
            `${camelCase(p.columnName)}: ${mapTypescriptTypeToGraphQLType(
              p.fieldName,
              p.fieldType as SupportedTypescriptTypes,
            )}!`,
        )
        .join(" ")} }`;
      return [enumDecl, "", detailDecl, ""];
    })
    .flat();

  const allEnumDetailsResult = `type AllEnumDetails {
      ${Object.values(enums)
        .map(({ name }) => `${camelCase(name)}: [${name}Detail!]!`)
        .join("\n")} 
    }`;

  const formatted = await formatGraphQL([...contents, allEnumDetailsResult].join("\n"));

  return { name: "../../schema/enums.graphql", overwrite: true, contents: formatted };
}
