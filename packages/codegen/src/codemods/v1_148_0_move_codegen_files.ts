import { mkdir, readFile, readdir, rename, rm, writeFile } from "fs/promises";
import { Config } from "../config";
import { Codemod } from "./Codemod";

export const v1_148_0_move_codegen_files: Codemod = {
  version: "1.148.0",
  name: "v1_148_0_move_codegen_files",
  description: "Moving codegen files into subdirectories",
  run: async (config) => {
    const allFiles = await readExistingFiles(config);
    for (const file of allFiles) {
      const remove = file === "metadata.ts" || file === "factories.ts" || file.endsWith("Codegen.ts");
      if (remove) {
        await rm(config.entitiesDirectory + "/" + file);
      } else if (file.endsWith(".factories.ts")) {
        const entityName = file.replace(".factories.ts", "");
        await mkdir(config.entitiesDirectory + "/factories", { recursive: true });
        const newFile = config.entitiesDirectory + `/factories/new${entityName}.ts`;
        await rename(config.entitiesDirectory + "/" + file, newFile);
        // Fixup the imports
        const contents = await readFile(newFile);
        await writeFile(newFile, contents.toString().replaceAll(/from "\.\/entities"/g, `from "../entities"`));
      } else if (file.endsWith(".ts")) {
        // Enum files are moving too
        const contents = await readFile(config.entitiesDirectory + "/" + file);
        if (contents.includes("const details: Record")) {
          await rm(config.entitiesDirectory + "/" + file);
        }
      }
    }
  },
};

/** Reads the `entitiesDirectory` but just ignores if it doesn't exist yet. */
async function readExistingFiles(config: Config): Promise<string[]> {
  try {
    return readdir(config.entitiesDirectory);
  } catch (e) {
    return [];
  }
}
