import { pascalCase } from "change-case";
import { CodeGenFile, EnumRows } from "joist-codegen";
import { code } from "ts-poet";

/** Generates a `schema/enums.graphql` with GQL enums that match all of our domain enums. */
export function generateEnumsGraphql(enums: EnumRows): CodeGenFile {
  const contents = Object.entries(enums)
    .map(([_name, rows]) => {
      const name = pascalCase(_name);
      const enumDecl = `enum ${name} { ${rows.map((r) => r.code).join(" ")} }`;
      const detailDecl = `type ${name}Detail { code: ${name}! name: String! }`;
      return [enumDecl, detailDecl, ""];
    })
    .flat()
    .join("\n");
  return { name: "../../schema/enums.graphql", overwrite: true, contents: code`${contents}` };
}
