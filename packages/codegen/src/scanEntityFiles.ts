import { readFile } from "fs/promises";
import { join } from "path";
import {
  DbMetadata,
  EntityDbMetadata,
  EnumField,
  ManyToOneField,
  PgEnumField,
  PolymorphicField,
  PrimitiveField,
} from "./EntityDbMetadata";
import { Config } from "./config";

// Erg, we need a regex in case the fieldName arg is wrapped onto a new line... :-/
const regex = /config\.setDefault\([\s\n]*["'](\w+)["']/g;

/** Scans the entity files themselves for usage hints (like `setDefault` calls) to drive our codegen output. */
export async function scanEntityFiles(config: Config, dbMeta: DbMetadata): Promise<void> {
  await Promise.all(
    dbMeta.entities.map(async (entity) => {
      try {
        // load the entity.ts file (as a promise with fs/promises)
        const tsCode = (await readFile(join(config.entitiesDirectory, `${entity.name}.ts`))).toString();
        const defaultableFields = recursiveDefaultableFields(dbMeta, entity);
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

/**
 * Traverse the entity inheritance tree to find all fields that can have defaults set on them.
 *
 * I.e. a column defined in a base CTI table like `publishers.foo_bar` having a `config.setDefault` in
 * `SmallPublisher` and/or `LargePublisher`, or the same scenario for an STI table like `tasks.foo_bar`
 * with `TaskNew` and/or `TaskOld`.
 *
 * NOTE: I suspect here could be some edge cases here that will need to be ironed out, but should work
 * for simple inheritance structures. In particular, there may be unexpected side effects if a base
 * class field has a default set in one subtype, but not another.
 */
function recursiveDefaultableFields(
  dbMeta: DbMetadata,
  entity: EntityDbMetadata | undefined,
): Array<PrimitiveField | EnumField | PgEnumField | ManyToOneField | PolymorphicField> {
  if (!entity) return [];
  return [
    ...entity.primitives,
    ...entity.enums,
    ...entity.pgEnums,
    ...entity.manyToOnes,
    ...entity.polymorphics,
    ...(entity.baseClassName ? recursiveDefaultableFields(dbMeta, dbMeta.entitiesByName[entity.baseClassName]) : []),
  ];
}
