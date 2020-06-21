import { CodeGenFile, EntityDbMetadata, EnumRows } from "joist-codegen";
import { generateEnumResolvers } from "./generateEnumResolvers";
import { generateEnumsGraphql } from "./generateEnumsGraphql";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen";

export function run(entities: EntityDbMetadata[], enums: EnumRows): CodeGenFile[] {
  return [generateEnumsGraphql(enums), generateEnumResolvers(enums), generateGraphqlCodegen(entities, enums)];
}
