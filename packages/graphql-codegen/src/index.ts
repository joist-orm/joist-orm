import { Config, DbMetadata } from "joist-codegen";
import { CodegenFile } from "ts-poet";
import { generateEnumDetailResolvers } from "./generateEnumDetailResolvers";
import { generateEnumsGraphql } from "./generateEnumsGraphql";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen";
import { generateGraphqlSchemaFiles } from "./generateGraphqlSchemaFiles";
import { generateObjectResolvers } from "./generateObjectResolvers";
import { generateSaveResolvers } from "./generateSaveResolvers";
import { loadHistory, writeHistory } from "./history";
import { Fs, newFsImpl } from "./utils";

export async function run(config: Config, dbMeta: DbMetadata): Promise<CodegenFile[]> {
  const fs = newFsImpl("./schema");

  // We upsert directly into schema files so we don't use the usual `CodeGenFile[]` return type;
  await generateGraphqlSchemaFiles(fs, dbMeta);

  // We use the history file to ensure we only generate these once
  const { entities, enums } = dbMeta;
  const conditionalResolvers = [
    ...generateObjectResolvers(config, entities),
    ...generateSaveResolvers(config, dbMeta),
    // Going to roll this out as a follow up
    // ...generateQueryResolvers(dbMeta),
  ];
  const srcFs = newFsImpl("./src");
  await writeOnce(config, srcFs, conditionalResolvers);

  return [
    await generateEnumsGraphql(enums),
    generateEnumDetailResolvers(config, enums),
    generateGraphqlCodegen(entities, enums),
  ];
}

/** Conditionally outputs files only once, so we don't re-spam unwanted/unneeded files. */
async function writeOnce(config: Config, fs: Fs, files: CodegenFile[]) {
  // We sneak a `files` entry into the history map, which is usually `type -> fields[]`
  const history = await loadHistory(fs);
  const filesHistory = (history["files"] = history["files"] || []);
  const esmExt = config.esm ? (config.allowImportingTsExtensions ? "ts" : "js") : "";
  await Promise.all(
    files.map(async (file) => {
      if (!filesHistory.includes(file.name)) {
        // Even if it's not in the history, make sure it doesn't already exist on disk
        if (!(await fs.exists(file.name))) {
          await fs.save(file.name, contentToString(file, esmExt));
        }
        filesHistory.push(file.name);
      }
    }),
  );
  await writeHistory(fs, history);
}

function contentToString(file: CodegenFile, esmExt: string): string {
  if (typeof file.contents === "string") {
    return file.contents;
  }
  return file.contents.toString({
    path: file.name,
    importExtensions: (esmExt as "ts" | "js") || false,
  });
}
