import { readFile } from "fs/promises";
import { join } from "path";
import { DbMetadata } from "./EntityDbMetadata";
import { Config } from "./config";

// Erg, we need a regex in case the fieldName arg is wrapped onto a new line... :-/
const regex = /config\.setDefault\([\s\n]*"(\w+)"|config\.setDefault\([\s\n]*'(\w+)'/g;

/** Scans the entity files themselves for usage hints (like `setDefault` calls) to drive our codegen output. */
export async function scanEntityFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  await Promise.all(
    dbMeta.entities.map(async (entity) => {
      try {
        // load the entity.ts file (as a promise with fs/promises)
        const tsCode = (await readFile(join(config.entitiesDirectory, `${entity.name}.ts`))).toString();
        const defaultableFields = [
          ...entity.primitives,
          ...entity.enums,
          ...entity.pgEnums,
          ...entity.manyToOnes,
          ...entity.polymorphics,
        ];
        for (const match of tsCode.matchAll(regex)) {
          const field = defaultableFields.find((f) => f.fieldName === match[1]);
          if (field) {
            field.hasConfigDefault = true;
          }
        }
      } catch (e) {
        // Ignore file not existing yet
      }
    }),
  );
}
