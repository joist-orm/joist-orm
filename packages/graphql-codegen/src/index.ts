import { CodeGenFile, EntityDbMetadata, EnumRows } from "joist-codegen";
import { generateEnumDetailResolvers } from "./generateEnumDetailResolvers";
import { generateEnumsGraphql } from "./generateEnumsGraphql";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen";
import { generateGraphqlSchemaFiles } from "./generateGraphqlSchemaFiles";
import { newFsImpl } from "./utils";

export async function run(entities: EntityDbMetadata[], enums: EnumRows): Promise<CodeGenFile[]> {
  const fs = newFsImpl("./schema");

  // We upsert directly into schema files so we don't use the usual `CodeGenFile[]` return type;
  await generateGraphqlSchemaFiles(fs, entities);

  return [await generateEnumsGraphql(enums), generateEnumDetailResolvers(enums), generateGraphqlCodegen(entities, enums)];
}
