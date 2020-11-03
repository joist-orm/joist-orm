import { CodeGenFile, EnumMetadata } from "joist-codegen";
import { formatGraphQL } from "./graphqlUtils";
import { camelCase } from "change-case";

/** Generates a `schema/enums.graphql` with GQL enums that match all of our domain enums. */
export async function generateEnumsGraphql(enums: EnumMetadata): Promise<CodeGenFile> {
  const contents = Object.values(enums)
    .map(({ name, rows, extraPrimitives }) => {
      const enumDecl = `enum ${name} { ${rows.map((r) => r.code).join(" ")} }`;
      const detailDecl = `type ${name}Detail { code: ${name}! name: String! ${extraPrimitives
        .map(p => `${camelCase(p.columnName)}: ${mapSimpleDbType(p.columnType)}!`).join(" ")} }`;
      return [enumDecl, "", detailDecl, ""];
    })
    .flat()
    .join("\n");

  const formatted = await formatGraphQL(contents);

  return { name: "../../schema/enums.graphql", overwrite: true, contents: formatted };
}

/** Maps db types, i.e. `int`, to GraphQL types, i.e. `Int`. */
function mapSimpleDbType(dbType: string): string {
  switch (dbType) {
    case "boolean":
      return "Boolean";
    case "int":
    case "numeric":
      return "Int";
    case "text":
    case "citext":
    case "character varying":
      return "String";
    case "timestamp with time zone":
    case "date":
      return "Date";
    default:
      throw new Error(`Unrecognized type "${dbType}"`);
  }
}
