import { camelCase } from "change-case";
import { EntityDbMetadata } from "joist-codegen";
import { groupBy } from "joist-utils";
import { SymbolSpec } from "ts-poet/build/SymbolSpecs";
import { GqlField, upsertIntoFile } from "./graphqlUtils";
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
  const fields = [...createEntityFields(entities), ...createEntityInputFields(entities)];

  const history = await loadHistory(fs);
  const newFields = fields.filter(({ objectType, fieldName }) => !history[objectType]?.includes(fieldName));
  if (newFields.length === 0) {
    return;
  }

  newFields.forEach(({ objectName, fieldName }) => {
    (history[objectName] = history[objectName] || []).push(fieldName);
  });
  await writeHistory(fs, history);

  await Promise.all(
    Object.entries(groupBy(newFields, (f) => f.file)).map(([file, fields]) => {
      return upsertIntoFile(fs, file, fields);
    }),
  );
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
      const fieldType = `${mapFieldTypeToGraphQLType(tsType)}${maybeRequired(notNull)}`;
      return { ...common, fieldName, fieldType };
    });

    const enums = e.enums.map(({ fieldName, enumType, notNull }) => {
      const fieldType = `${enumType.value}${maybeRequired(notNull)}`;
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

/** Make all of the fields for `type SaveAuthorInput`, `type SaveBookBook`, etc. */
function createEntityInputFields(entities: EntityDbMetadata[]): GqlField[] {
  return entities.flatMap((e) => {
    const file = fileName(e);
    const objectType = "input" as const;
    const objectName = `Save${e.entity.name}Input`;
    const common = { file, objectType, objectName };

    const id: GqlField = { ...common, fieldName: "id", fieldType: "ID" };

    const primitives = e.primitives.map(({ fieldName, fieldType: tsType }) => {
      const fieldType = `${mapFieldTypeToGraphQLType(tsType)}`;
      return { ...common, fieldName, fieldType };
    });

    const enums = e.enums.map(({ fieldName, enumType }) => {
      return { ...common, fieldName, fieldType: enumType.value };
    });

    const m2os = e.manyToOnes.map(({ fieldName }) => {
      return { ...common, fieldName: `${fieldName}Id`, fieldType: "ID" };
    });

    return [id, ...primitives, ...enums, ...m2os];
  });
}

function mapFieldTypeToGraphQLType(type: string | SymbolSpec): string | SymbolSpec {
  switch (type) {
    case "string":
      return "String";
    case "boolean":
      return "Boolean";
    case "number":
      return "Int";
    default:
      return type;
  }
}

function maybeRequired(notNull: boolean): string {
  return notNull ? "!" : "";
}

/** I.e. `Book` --> `books.graphql`. */
function fileName(e: EntityDbMetadata): string {
  return `${camelCase(e.entity.name)}.graphql`;
}
