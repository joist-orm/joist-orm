import { CodeGenFile, EntityDbMetadata, EnumRows } from "joist-codegen";
import { generateEnumDetailResolvers } from "./generateEnumDetailResolvers";
import { generateEnumsGraphql } from "./generateEnumsGraphql";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen";

export function run(entities: EntityDbMetadata[], enums: EnumRows): CodeGenFile[] {
  return [generateEnumsGraphql(enums), generateEnumDetailResolvers(enums), generateGraphqlCodegen(entities, enums)];
}
