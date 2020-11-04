import { CodeGenFile, Config, EntityDbMetadata, EnumMetadata } from "joist-codegen";
import { Code } from "ts-poet";
import { generateEnumDetailResolvers } from "./generateEnumDetailResolvers";
import { generateEnumsGraphql } from "./generateEnumsGraphql";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen";
import { generateGraphqlSchemaFiles } from "./generateGraphqlSchemaFiles";
import { generateObjectResolvers } from "./generateObjectResolvers";
import { generateSaveResolvers } from "./generateSaveResolvers";
import { loadHistory, writeHistory } from "./history";
import { Fs, newFsImpl } from "./utils";

export async function run(config: Config, entities: EntityDbMetadata[], enums: EnumMetadata): Promise<CodeGenFile[]> {
  const fs = newFsImpl("./schema");

  // We upsert directly into schema files so we don't use the usual `CodeGenFile[]` return type;
  await generateGraphqlSchemaFiles(fs, entities);

  // We use the history file to ensure we only generate these once
  const conditionalResolvers = [
    ...generateObjectResolvers(config, entities),
    ...generateSaveResolvers(config, entities),
  ];
  const srcFs = newFsImpl("./src");
  await writeOnce(config, srcFs, conditionalResolvers);

  return [
    await generateEnumsGraphql(enums),
    generateEnumDetailResolvers(enums),
    generateGraphqlCodegen(entities, enums),
  ];
}

/** Conditionally outputs files only once, so we don't re-spam unwanted/unneeded files. */
async function writeOnce(config: Config, fs: Fs, files: CodeGenFile[]) {
  // We sneak a `files` entry into the history map, which is usually `type -> fields[]`
  const history = await loadHistory(fs);
  const filesHistory = (history["files"] = history["files"] || []);
  for (const file of files) {
    if (!filesHistory.includes(file.name)) {
      // Even if it's not in the history, make sure it doesn't already exist on disk
      if (!(await fs.exists(file.name))) {
        await fs.save(file.name, await contentToString(file.contents, file.name));
      }
      filesHistory.push(file.name);
    }
  }
  await writeHistory(fs, history);
}

export async function contentToString(content: Code | string, fileName: string): Promise<string> {
  if (typeof content === "string") {
    return content;
  }
  return await content.toStringWithImports(fileName);
}
