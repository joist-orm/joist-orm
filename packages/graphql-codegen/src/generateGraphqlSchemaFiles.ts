import { camelCase } from "change-case";
import { EntityDbMetadata } from "joist-codegen";
import { groupBy } from "joist-utils";
import { GqlField, GqlUnion, mapTypescriptTypeToGraphQLType, upsertIntoFile } from "./graphqlUtils";
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
  // Generate the "ideal" fields based solely on the domain model
  const fields = [
    ...createSaveMutation(entities),
    ...createEntityFields(entities),
    ...createSaveEntityInputFields(entities),
    ...createSaveEntityResultFields(entities),
  ];

  const unions = createPolymorphicUnions(entities);

  // Load the history and filter out only "new" / not-yet-added-to-.graphql fields
  const history = await loadHistory(fs);
  const newEntries = [
    ...fields.filter(({ objectName, fieldName }) => !history[objectName]?.includes(fieldName)),
    ...unions.filter(({ objectName, types }) => {
      const set = new Set(history[objectName] ?? []);
      return !(set.size === types.length && types.every((type) => set.has(type)));
    }),
  ];
  if (newEntries.length === 0) {
    return;
  }

  // Update the `.graphql` files with our new types/fields
  await Promise.all(
    Object.entries(groupBy(newEntries, (f) => f.file)).map(([file, fields]) => {
      return upsertIntoFile(fs, file, fields);
    }),
  );

  // Record the current batch of fields back to the history file
  newEntries.forEach((entry) => {
    if (entry.objectType === "union") {
      const { objectName, types } = entry;
      history[objectName] = types;
    } else {
      const { objectName, fieldName } = entry;
      const fields = (history[objectName] = history[objectName] || []);
      if (!fields.includes(fieldName)) {
        fields.push(fieldName);
      }
    }
  });
  await writeHistory(fs, history);
}

/** Make all the fields for `type Author`, `type Book`, etc. */
function createPolymorphicUnions(entities: EntityDbMetadata[]): GqlUnion[] {
  return entities.flatMap((e) => {
    const file = fileName(e);
    return e.polymorphics.map(({ fieldType, components }) => {
      return { file, objectType: "union", objectName: fieldType, types: components.map((c) => c.otherEntity.name) };
    });
  });
}

/** Make all the fields for `type Author`, `type Book`, etc. */
function createEntityFields(entities: EntityDbMetadata[]): GqlField[] {
  return entities.flatMap((e) => {
    const file = fileName(e);
    const objectType = "output" as const;
    const objectName = e.entity.name;
    const common = { file, objectType, objectName };

    const id: GqlField = { ...common, fieldName: "id", fieldType: "ID!" };

    const primitives = e.primitives.flatMap(({ fieldName, fieldType: tsType, notNull }) => {
      const gqlType = mapTypescriptTypeToGraphQLType(fieldName, tsType);
      if (!gqlType) return [];
      const fieldType = `${gqlType}${maybeRequired(notNull)}`;
      return [{ ...common, fieldName, fieldType }];
    });

    const enums = e.enums.map(({ fieldName, enumType, notNull, isArray }) => {
      const fieldType = isArray ? `[${enumType.symbol}!]!` : `${enumType.symbol}Detail${maybeRequired(notNull)}`;
      return { ...common, fieldName, fieldType };
    });
    const pgEnums = e.pgEnums.map(({ fieldName, enumType, notNull }) => {
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

    const polys = e.polymorphics.map(({ fieldName, fieldType }) => {
      return { ...common, fieldName, fieldType };
    });

    const inheritedFields = e.baseClassName
      ? createEntityFields([findBaseEntity(entities, e.baseClassName)])
          .map((f) => ({ ...f, ...common }))
          .filter((f) => f.fieldName !== "id")
      : [];

    return [id, ...inheritedFields, ...primitives, ...enums, ...pgEnums, ...m2os, ...o2ms, ...m2ms, ...o2os, ...polys];
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

/** Make all the fields for `type SaveAuthorInput`, `type SaveBookBook`, etc. */
function createSaveEntityInputFields(entities: EntityDbMetadata[]): GqlField[] {
  return entities.flatMap((e) => {
    const file = fileName(e);
    const objectType = "input" as const;
    const objectName = `Save${e.entity.name}Input`;
    const common = { file, objectType, objectName };

    const id: GqlField = { ...common, fieldName: "id", fieldType: "ID" };

    const primitives = e.primitives
      .filter((f) => f.derived === false)
      .flatMap(({ fieldName, fieldType: tsType }) => {
        const gqlType = mapTypescriptTypeToGraphQLType(fieldName, tsType);
        if (!gqlType) return [];
        const fieldType = `${gqlType}`;
        return [{ ...common, fieldName, fieldType }];
      });

    const enums = e.enums.map(({ fieldName, enumType, isArray }) => {
      return { ...common, fieldName, fieldType: isArray ? `[${enumType.symbol}!]` : enumType.symbol };
    });
    const pgEnums = e.pgEnums.map(({ fieldName, enumType }) => {
      return { ...common, fieldName, fieldType: enumType.symbol };
    });

    const m2os = e.manyToOnes.map(({ fieldName }) => {
      return { ...common, fieldName: `${fieldName}Id`, fieldType: "ID" };
    });

    const polys = e.polymorphics.map(({ fieldName }) => {
      return { ...common, fieldName: `${fieldName}Id`, fieldType: "ID" };
    });

    const inherited = e.baseClassName
      ? createSaveEntityInputFields([findBaseEntity(entities, e.baseClassName)])
          .map((f) => ({ ...f, ...common }))
          .filter((f) => f.fieldName !== "id")
      : [];

    return [id, ...inherited, ...primitives, ...enums, ...pgEnums, ...m2os, ...polys];
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

function findBaseEntity(entities: EntityDbMetadata[], baseClassName: string): EntityDbMetadata {
  return entities.find((e) => e.entity.name === baseClassName) as EntityDbMetadata;
}
