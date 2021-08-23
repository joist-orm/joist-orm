import { camelCase } from "change-case";
import { EntityDbMetadata } from "joist-codegen";
import { groupBy } from "joist-utils";
import { GqlField, mapTypescriptTypeToGraphQLType, upsertIntoFile } from "./graphqlUtils";
import { loadHistory, writeHistory } from "./history";
import { Fs } from "./utils";

/**
 * Generates `*.graphql` files based on the database schema.
 *
 * This follows an "evergreen" approach where we upsert changes into files that are also
 * hand-modified by the programmer. We remember what insertions we've made in a history file,
 * and will only do them once, which allows programmers to manually add/edit/remove fields
 * without this stomping over their changes.
 */
export async function generateGraphqlSchemaFiles(fs: Fs, entities: EntityDbMetadata[]): Promise<void> {
  // Generate all of the "ideal" fields based solely on the domain model
  const fields = [
    ...createEntityFields(entities),
    ...createSaveMutation(entities),
    ...createSaveEntityInputFields(entities),
    ...createSaveEntityResultFields(entities),
  ];

  // Load the history and filter out only "new" / not-yet-added-to-.graphql fields
  const history = await loadHistory(fs);
  const newFields = fields.filter(({ objectName, fieldName }) => !history[objectName]?.includes(fieldName));
  if (newFields.length === 0) {
    return;
  }

  // Update the `.graphql` files with our new types/fields
  await Promise.all(
    Object.entries(groupBy(newFields, (f) => f.file)).map(([file, fields]) => {
      return upsertIntoFile(fs, file, fields);
    }),
  );

  // Record the current batch of fields back to the history file
  newFields.forEach(({ objectName, fieldName }) => {
    const fields = (history[objectName] = history[objectName] || []);
    if (!fields.includes(fieldName)) {
      fields.push(fieldName);
    }
  });
  await writeHistory(fs, history);
}

/** Make all of the fields for `type Author`, `type Book`, etc. */
function createEntityFields(entities: EntityDbMetadata[]): GqlField[] {
  return entities.flatMap((e) => {
    const file = fileName(e);
    const objectType = "output" as const;
    const objectName = e.entity.name;
    const common = { file, objectType, objectName };

    const id: GqlField = { ...common, fieldName: "id", fieldType: "ID!" };

    const primitives = e.primitives.map(({ fieldName, fieldType: tsType, notNull }) => {
      const fieldType = `${mapTypescriptTypeToGraphQLType(fieldName, tsType)}${maybeRequired(notNull)}`;
      return { ...common, fieldName, fieldType };
    });

    const enums = e.enums.map(({ fieldName, enumType, notNull }) => {
      const fieldType = `${enumType.symbol}${maybeRequired(notNull)}`;
      return { ...common, fieldName, fieldType };
    });

    const m2os = e.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
      const fieldType = `${otherEntity.name}${maybeRequired(notNull)}`;
      return { ...common, fieldName, fieldType };
    });

    const o2ms = e.oneToManys.map(({ fieldName, otherEntity }) => {
      const fieldType = `[${otherEntity.name}!]!`;
      return { ...common, fieldName, fieldType };
    });

    const m2ms = e.manyToManys.map(({ fieldName, otherEntity }) => {
      const fieldType = `[${otherEntity.name}!]!`;
      return { ...common, fieldName, fieldType };
    });

    const o2os = e.oneToOnes.map(({ fieldName, otherEntity }) => {
      return { ...common, fieldName, fieldType: otherEntity.name };
    });

    return [id, ...primitives, ...enums, ...m2os, ...o2ms, ...m2ms, ...o2os];
  });
}

/** Makes the `Mutations.save${entity}` placeholder. */
function createSaveMutation(entities: EntityDbMetadata[]): GqlField[] {
  return entities.map((e) => {
    const file = fileName(e);
    const inputType = `Save${e.entity.name}Input`;
    const outputType = `Save${e.entity.name}Result`;
    return {
      file,
      objectType: "output",
      objectName: "Mutation",
      fieldName: `save${e.entity.name}`,
      fieldType: `${outputType}!`,
      argsString: `input: ${inputType}!`,
      extends: true,
    };
  });
}

/** Make all of the fields for `type SaveAuthorInput`, `type SaveBookBook`, etc. */
function createSaveEntityInputFields(entities: EntityDbMetadata[]): GqlField[] {
  return entities.flatMap((e) => {
    const file = fileName(e);
    const objectType = "input" as const;
    const objectName = `Save${e.entity.name}Input`;
    const common = { file, objectType, objectName };

    const id: GqlField = { ...common, fieldName: "id", fieldType: "ID" };

    const primitives = e.primitives
      .filter((f) => f.derived === false)
      .map(({ fieldName, fieldType: tsType }) => {
        const fieldType = `${mapTypescriptTypeToGraphQLType(fieldName, tsType)}`;
        return { ...common, fieldName, fieldType };
      });

    const enums = e.enums.map(({ fieldName, enumType }) => {
      return { ...common, fieldName, fieldType: enumType.symbol };
    });

    const m2os = e.manyToOnes.map(({ fieldName }) => {
      return { ...common, fieldName: `${fieldName}Id`, fieldType: "ID" };
    });

    return [id, ...primitives, ...enums, ...m2os];
  });
}

/** Makes the fields for `type SaveAuthorResult`, `type SaveBookResult`, etc. */
function createSaveEntityResultFields(entities: EntityDbMetadata[]): GqlField[] {
  return entities.flatMap((e) => {
    const file = fileName(e);
    const {
      entity: { name },
    } = e;
    const objectType = "output" as const;
    const objectName = `Save${name}Result`;
    const fieldName = camelCase(name);
    const entity: GqlField = { file, objectType, objectName, fieldName, fieldType: `${name}!` };
    return [entity];
  });
}

function maybeRequired(notNull: boolean): string {
  return notNull ? "!" : "";
}

/** I.e. `Book` --> `books.graphql`. */
function fileName(e: EntityDbMetadata): string {
  return `${camelCase(e.entity.name)}.graphql`;
}
