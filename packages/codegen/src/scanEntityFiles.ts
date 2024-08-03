import { readFile } from "fs/promises";
import { join } from "path";
import { DbMetadata } from "./EntityDbMetadata";
import { Config } from "./config";

/** Scans the entity files themselves for usage hints (like `setDefault` calls) to drive our codegen output. */
export async function scanEntityFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  await Promise.all(
    dbMeta.entities.map(async (entity) => {
      try {
        // load the entity.ts file (as a promise with fs/promises)
        const tsCode = (await readFile(join(config.entitiesDirectory, `${entity.name}.ts`))).toString();
        for (const field of [...entity.primitives, ...entity.manyToOnes, ...entity.enums, ...entity.pgEnums]) {
          if (tsCode.includes(`config.setDefault("${field.fieldName}"`)) {
            field.hasConfigDefault = true;
          }
        }
      } catch (e) {
        // Ignore file not existing yet
      }
    }),
  );
}
