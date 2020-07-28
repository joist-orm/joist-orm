import { pascalCase } from "change-case";
import { CodeGenFile, EnumRows } from "joist-codegen";
import { formatGraphQL } from "./graphqlUtils";

/** Generates a `schema/enums.graphql` with GQL enums that match all of our domain enums. */
export async function generateEnumsGraphql(enums: EnumRows): Promise<CodeGenFile> {
  const contents = Object.entries(enums)
    .map(([_name, rows]) => {
      const name = pascalCase(_name);
      const enumDecl = `enum ${name} { ${rows.map((r) => r.code).join(" ")} }`;
      const detailDecl = `type ${name}Detail { code: ${name}! name: String! }`;
      return [enumDecl, "", detailDecl, ""];
    })
    .flat()
    .join("\n");

  const formatted = await formatGraphQL(contents);

  return { name: "../../schema/enums.graphql", overwrite: true, contents: formatted };
}
