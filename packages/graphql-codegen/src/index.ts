import { type Config, type DbMetadata } from "joist-codegen";
import { type CodegenFile } from "ts-poet";

import { generateEnumDetailResolvers } from "./generateEnumDetailResolvers.ts";
import { generateEnumsGraphql } from "./generateEnumsGraphql.ts";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen.ts";
import { generateGraphqlSchemaFiles } from "./generateGraphqlSchemaFiles.ts";
import { generateObjectResolvers } from "./generateObjectResolvers.ts";
import { generateQueryPageResolvers } from "./generateQueryPageResolvers.ts";
import { generateQueryResolvers } from "./generateQueryResolvers.ts";
import { generateResolverUtils } from "./generateResolverUtils.ts";
import { generateSaveResolvers } from "./generateSaveResolvers.ts";
import { loadHistory, writeHistory } from "./history.ts";
import { type Fs, getImportExtension, newFsImpl } from "./utils.ts";

export async function run(config: Config, dbMeta: DbMetadata): Promise<CodegenFile[]> {
  const fs = newFsImpl("./schema");

  // We upsert directly into schema files so we don't use the usual `CodeGenFile[]` return type;
  await generateGraphqlSchemaFiles(config, fs, dbMeta);

  // We use the history file to ensure we only generate these once
  const { entities, enums } = dbMeta;
  const conditionalResolvers = [
    ...generateObjectResolvers(config, entities),
    ...generateSaveResolvers(config, dbMeta),
    ...generateQueryResolvers(config, dbMeta),
    ...generateQueryPageResolvers(config, dbMeta),
    ...generateResolverUtils(config),
  ];
  const srcFs = newFsImpl("./src");
  await writeOnce(config, srcFs, conditionalResolvers);

  return [
    await generateEnumsGraphql(enums),
    generateEnumDetailResolvers(config, enums),
    generateGraphqlCodegen(config, entities, enums),
  ];
}

/** Conditionally outputs files only once, so we don't re-spam unwanted/unneeded files. */
async function writeOnce(config: Config, fs: Fs, files: CodegenFile[]) {
  // We sneak a `files` entry into the history map, which is usually `type -> fields[]`
  const history = await loadHistory(fs);
  const filesHistory = (history["files"] = history["files"] || []);
  const esmExt = getImportExtension(config);
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

function contentToString(file: CodegenFile, esmExt: "ts" | "js" | null): string {
  if (typeof file.contents === "string") {
    return file.contents;
  }
  return file.contents.toString({
    path: file.name,
    importExtensions: esmExt || false,
  });
}
