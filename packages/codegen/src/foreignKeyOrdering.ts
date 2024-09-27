import { promises as fs } from "fs";
import { ManyToOneField, PolymorphicFieldComponent } from "./EntityDbMetadata";
import { Config, EntityDbMetadata } from "./index";
import { logger } from "./logger";
import { sortByNonDeferredForeignKeys } from "./sortForeignKeys";
import { assertNever } from "./utils";

export async function maybeSetForeignKeyOrdering(config: Config, entities: EntityDbMetadata[]): Promise<boolean> {
  // Hopefully all FKs are deferred, but if not...
  const hasAnyNonDeferredFks = entities.some((e) => e.nonDeferredFks.length > 0);
  if (!hasAnyNonDeferredFks) {
    // Great, nothing to do
    for (const entity of entities) entity.nonDeferredFkOrder = 0;
    return false;
  }

  let hasError = false;

  // Topo sort the non-deferred FKs into a DAG to establish insert/flush order
  const { notNullCycles } = sortByNonDeferredForeignKeys(entities);

  const { nonDeferredForeignKeys: setting = "warn" } = config;
  const nonDeferredFks = entities.flatMap((e) => e.nonDeferredFks.map((m2o) => ({ entity: e, m2o })));

  if (setting === "error" || setting === "warn") {
    logger[setting](`Found ${nonDeferredFks.length} foreign keys that are not DEFERRABLE/INITIALLY DEFERRED`);
    for (const { entity, m2o } of nonDeferredFks) console.log(`${entity.tableName}.${m2o.columnName}`);
    console.log("");

    console.log("Please either:");
    console.log(" - Alter your migration to create the FKs as deferred (ideal)");
    console.log(" - Execute the generated alter-foreign-keys.sql file (one-time fix)");
    console.log(" - Set 'nonDeferredFks: ignore' in joist-config.json");
    console.log("");

    console.log("See https://joist-orm.io/docs/getting-started/schema-assumptions#deferred-constraints");
    console.log("");

    await writeAlterTables(nonDeferredFks);

    if (setting === "error") hasError = true;
  } else if (setting === "ignore") {
    // We trust the user to know what they're doing
  } else {
    assertNever(setting);
  }

  // Always treat these as errors, even if `ignore` is set; maybe we need a `ignore-even-not-null-cycles`?
  // But they would still probably break flush_test_database. Unless we tell it to disable constraints,
  // like `ALTER TABLE your_table_name DISABLE TRIGGER ALL;`. But still unsure how we'd insert new rows.
  if (notNullCycles.length > 0) {
    logger.error(`Found a schema cycle of not-null foreign keys:`);
    notNullCycles.forEach((cycle) => console.log(cycle));
    console.log("");
    console.log("These cycles can cause fatal em.flush & flush_test_database errors.");
    console.log("");
    console.log("Please make one of the FKs involved in the cycle nullable.");
    console.log("");
    hasError ??= true;
  }

  return hasError;
}

async function writeAlterTables(
  nonDeferredFks: Array<{ entity: EntityDbMetadata; m2o: ManyToOneField | PolymorphicFieldComponent }>,
): Promise<void> {
  const queries = nonDeferredFks.map(({ entity, m2o }) => {
    return `ALTER TABLE ${entity.tableName} ALTER CONSTRAINT ${m2o.constraintName} DEFERRABLE INITIALLY DEFERRED;`;
  });
  await fs.writeFile("./alter-foreign-keys.sql", queries.join("\n"));
}
