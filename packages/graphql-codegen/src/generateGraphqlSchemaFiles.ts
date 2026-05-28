import { camelCase } from "change-case";
import { Config, DbMetadata, EntityDbMetadata } from "joist-codegen";
import { groupBy } from "joist-utils";
import pluralize from "pluralize";
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
export async function generateGraphqlSchemaFiles(config: Config, fs: Fs, dbMeta: DbMetadata): Promise<void> {
  const { entities } = dbMeta;
  // Generate the "ideal" fields based solely on the domain model
  const fields = [
    ...createPageInfoFields(config),
    ...createQueryFields(config, entities),
    ...createSaveMutation(entities),
    ...createEntityFields(dbMeta),
    ...createFilterFields(dbMeta),
    ...createSaveEntityInputFields(dbMeta),
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

/** Makes the project's pagination metadata type. */
function createPageInfoFields(config: Config): GqlField[] {
  const common = { file: "index.graphql", objectType: "output" as const, objectName: "PageInfo" };
  const shared = [
    { ...common, fieldName: "hasNextPage", fieldType: "Boolean!" },
    { ...common, fieldName: "hasPreviousPage", fieldType: "Boolean!" },
    { ...common, fieldName: "totalCount", fieldType: "Int!" },
  ];

  // Joist assumes each project uses either cursor or limit pagination, so the public GraphQL type is
  // always named `PageInfo` but contains the fields for the configured pagination style.
  if ((config.paginationStyle ?? "cursor") === "limit") {
    return [
      ...shared,
      { ...common, fieldName: "nextPage", fieldType: "Int" },
      { ...common, fieldName: "currentPage", fieldType: "Int" },
    ];
  }

  return [
    ...shared,
    { ...common, fieldName: "startCursor", fieldType: "String" },
    { ...common, fieldName: "endCursor", fieldType: "String" },
  ];
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
function createEntityFields(dbMeta: DbMetadata): GqlField[] {
  const { entities } = dbMeta;
  return entities.flatMap((e) => {
    const file = fileName(e);
    const objectType = "output" as const;
    const objectName = e.entity.name;
    const common = { file, objectType, objectName };

    const id: GqlField = { ...common, fieldName: "id", fieldType: "ID!" };

    const primitives = e.primitives.flatMap(({ fieldName, fieldType: tsType, isArray, notNull }) => {
      const fieldType = primitiveFieldType(fieldName, tsType, isArray, notNull);
      if (!fieldType) return [];
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
      const other = dbMeta.entitiesByName[otherEntity.name];
      const maybeLike = other.subTypes.length > 0 && !other.abstract ? "Like" : "";
      const fieldType = `${otherEntity.name}${maybeLike}${maybeRequired(notNull)}`;
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

    // GraphQL wants base fields copy/pasted onto subtypes, so re-run ourselves against just the base type
    const inheritedFields = e.baseClassName
      ? createEntityFields(findBaseEntity(dbMeta, e.baseClassName))
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

/** Makes the `Query.${entity}` and `Query.${entity}s` placeholders. */
function createQueryFields(config: Config, entities: EntityDbMetadata[]): GqlField[] {
  return entities.flatMap((e) => {
    const file = fileName(e);
    const { name } = e.entity;
    const pluralName = pluralize(name);
    const camelName = camelCase(name);
    const pluralCamelName = pluralize(camelName);
    const collectionType =
      (config.paginationStyle ?? "cursor") === "limit" ? `${pluralName}Page!` : `${pluralName}Connection!`;
    const collectionArgs =
      (config.paginationStyle ?? "cursor") === "limit"
        ? `filter: ${name}Filter, limit: Int, offset: Int`
        : `filter: ${name}Filter, first: Int, after: String, last: Int, before: String`;
    return [
      {
        file,
        objectType: "output",
        objectName: "Query",
        fieldName: camelName,
        fieldType: `${name}!`,
        argsString: `id: ID!`,
        extends: true,
      },
      {
        file,
        objectType: "output",
        objectName: "Query",
        fieldName: pluralCamelName,
        fieldType: collectionType,
        argsString: collectionArgs,
        extends: true,
      },
      ...createPaginationTypes(config, file, e),
    ];
  });
}

/** Makes the `AuthorFilter`, `BookFilter`, etc. input types. */
function createFilterFields(dbMeta: DbMetadata): GqlField[] {
  const { entities } = dbMeta;
  return entities.flatMap((e) => {
    const file = fileName(e);
    const objectType = "input" as const;
    const objectName = `${e.entity.name}Filter`;
    const common = { file, objectType, objectName };

    const id: GqlField = { ...common, fieldName: "id", fieldType: "ID" };

    const primitives = e.primitives.flatMap(({ fieldName, fieldType: tsType, isArray }) => {
      const fieldType = primitiveFieldType(fieldName, tsType, isArray);
      if (!fieldType) return [];
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
      ? createFilterFields(findBaseEntity(dbMeta, e.baseClassName))
          .map((f) => ({ ...f, ...common }))
          .filter((f) => f.fieldName !== "id")
      : [];

    return [id, ...inherited, ...primitives, ...enums, ...pgEnums, ...m2os, ...polys];
  });
}

/** Makes the page/connection types for `Query.authors`. */
function createPaginationTypes(config: Config, file: string, e: EntityDbMetadata): GqlField[] {
  const { name } = e.entity;
  const pluralName = pluralize(name);
  const objectType = "output" as const;
  if ((config.paginationStyle ?? "cursor") === "limit") {
    return [
      { file, objectType, objectName: `${pluralName}Page`, fieldName: "entities", fieldType: `[${name}!]!` },
      { file, objectType, objectName: `${pluralName}Page`, fieldName: "pageInfo", fieldType: "PageInfo!" },
    ];
  }
  return [
    { file, objectType, objectName: `${pluralName}Connection`, fieldName: "edges", fieldType: `[${pluralName}Edge!]!` },
    { file, objectType, objectName: `${pluralName}Connection`, fieldName: "nodes", fieldType: `[${name}!]!` },
    { file, objectType, objectName: `${pluralName}Connection`, fieldName: "pageInfo", fieldType: "PageInfo!" },
    { file, objectType, objectName: `${pluralName}Edge`, fieldName: "node", fieldType: `${name}!` },
    { file, objectType, objectName: `${pluralName}Edge`, fieldName: "cursor", fieldType: "String!" },
  ];
}

/** Make all the fields for `type SaveAuthorInput`, `type SaveBookBook`, etc. */
function createSaveEntityInputFields(dbMeta: DbMetadata): GqlField[] {
  const { entities } = dbMeta;
  return entities.flatMap((e) => {
    const file = fileName(e);
    const objectType = "input" as const;
    const objectName = `Save${e.entity.name}Input`;
    const common = { file, objectType, objectName };

    const id: GqlField = { ...common, fieldName: "id", fieldType: "ID" };

    const primitives = e.primitives
      .filter((f) => f.derived === false)
      .flatMap(({ fieldName, fieldType: tsType, isArray }) => {
        const fieldType = primitiveFieldType(fieldName, tsType, isArray);
        if (!fieldType) return [];
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
      ? createSaveEntityInputFields(findBaseEntity(dbMeta, e.baseClassName))
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

/** Returns the GraphQL type for primitive fields, including primitive arrays. */
function primitiveFieldType(
  fieldName: string,
  tsType: Parameters<typeof mapTypescriptTypeToGraphQLType>[1],
  isArray: boolean,
  notNull = false,
): string | undefined {
  const gqlType = mapTypescriptTypeToGraphQLType(fieldName, tsType);
  if (!gqlType) return undefined;
  const fieldType = isArray ? `[${gqlType}!]` : gqlType;
  return `${fieldType}${maybeRequired(notNull)}`;
}

/** I.e. `Book` --> `books.graphql`. */
function fileName(e: EntityDbMetadata): string {
  return `${camelCase(e.entity.name)}.graphql`;
}

function findBaseEntity(dbMeta: DbMetadata, baseClassName: string): DbMetadata {
  return {
    ...dbMeta,
    entities: dbMeta.entities.filter((e) => e.entity.name === baseClassName),
  };
}
