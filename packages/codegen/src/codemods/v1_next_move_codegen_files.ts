import { readdir, rm } from "fs/promises";
import { Config } from "../config";
import { Codemod } from "./Codemod";

export const v1_148_0_move_codegen_files: Codemod = {
  version: "1.148.0",
  name: "v1_148_0_rename_derived_async_property",
  description: "Rename `hasPersistedAsyncProperty` to `hasReactiveField`",
  run: async (config) => {
    const allFiles = await readExistingFiles(config);
    const filesToDelete = allFiles.filter((f) => f === "metadata.ts" || f.endsWith("Codegen.ts"));
    for (const file of filesToDelete) {
      await rm(config.entitiesDirectory + "/" + file);
    }
  },
};

/** Reads the `entitiesDirectory` but just ignores if it doesn't exist yet. */
async function readExistingFiles(config: Config): Promise<string[]> {
  try {
    return await readdir(config.entitiesDirectory);
  } catch (e) {
    return [];
  }
}
