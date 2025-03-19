import { createFromBuffer } from "@dprint/formatter";
import { getBuffer } from "@dprint/json";
import { DbMetadata, Entity, EntityDbMetadata } from "EntityDbMetadata";
import { promises as fs } from "fs";
import { groupBy } from "joist-utils";
import ts from "typescript";
import { z } from "zod";
import { getThisVersion } from "./codemods";
import { getStiEntities } from "./inheritance";
import { logger } from "./logger";
import { fail, sortKeys, trueIfResolved } from "./utils";

const jsonFormatter = createFromBuffer(getBuffer());

const fieldConfig = z
  .object({
    // For getters & ReactiveFields
    derived: z.optional(z.union([z.literal("sync"), z.literal("async")])),
    protected: z.optional(z.boolean()),
    ignore: z.optional(z.boolean()),
    superstruct: z.optional(z.string()),
    zodSchema: z.optional(z.string()),
    type: z.optional(z.string()),
    serde: z.optional(z.string()),
    stiDiscriminator: z.optional(z.record(z.string(), z.string())),
    stiType: z.optional(z.string()),
    // Allow subclasses to mark fields as required
    notNull: z.optional(z.boolean()),
    // Allow overriding scanEntities default detection for fields with defaults added by helpers
    hasDefault: z.optional(z.boolean()),
  })
  .strict();

export type FieldConfig = z.infer<typeof fieldConfig>;

const relationConfig = z
  .object({
    // For ReactiveReferences
    derived: z.optional(z.literal("async")),
    polymorphic: z.optional(z.union([z.literal("notNull"), z.literal(true)])),
    large: z.optional(z.boolean()),
    orderBy: z.optional(z.string()),
    // Allow pushing m2o/m2m/o2o relations in a base type (Task) down to a subtype (TaskOld)
    stiType: z.optional(z.string()),
    /**
     * Allow specializing a base type relation (SmallPublisher.group: SmallPublisherGroup).
     *
     * Self-referential FKs also support `subType: "self"` that means each subtype will point
     * at its own subtype.
     */
    subType: z.optional(z.string()),
    /** Allow skipping self-referential fields getting a `...Recursive` relation. */
    skipRecursiveRelations: z.optional(z.boolean()),
    // Allow marking m2o FKs as required on subclasses
    notNull: z.optional(z.boolean()),
    // Allow overriding scanEntities default detection for fields with defaults added by helpers
    hasDefault: z.optional(z.boolean()),
  })
  .strict();

export type RelationConfig = z.infer<typeof relationConfig>;

const entityConfig = z
  .object({
    tag: z.string(),
    tableName: z.optional(z.string()),
    fields: z.optional(z.record(fieldConfig)),
    relations: z.optional(z.record(relationConfig)),
    /** Whether this entity should be abstract, e.g. for inheritance a subtype must be instantiated instead of this type. */
    abstract: z.optional(z.boolean()),
    orderBy: z.optional(z.string()),
  })
  .strict();

export type EntityConfig = z.infer<typeof entityConfig>;

const timestampConfig = z
  .object({
    /** The names to check for this timestamp, i.e. `created_at` `created`, etc. */
    names: z.array(z.string()),
    /** Whether this timestamp column is required to consider a table an entity, defaults to `false`. */
    required: z.optional(z.boolean()),
  })
  .strict();

export type TimestampConfig = z.infer<typeof timestampConfig>;

export const config = z
  .object({
    /** The _build-time_ database URL for reading database metadata. */
    databaseUrl: z.optional(z.string()),
    /** Your application's request-level `Context` type. */
    contextType: z.optional(z.string()),
    /** Your application's database client's `Transaction` type. */
    transactionType: z.optional(z.string()),
    /**
     * Allows the user to specify the `updated_at` / `created_at` column names to look up, and if they're optional.
     *
     * We default to looking for `updated_at`, `updatedAt`, `created_at`, `createdAt`, and optional to true,
     * e.g. tables are not required to have both timestamp columns to be considered entities.
     *
     * These defaults are the most lenient, to facilitate running Joist against an existing schema and
     * seeing all of your entities, regardless of your previous conventions.
     */
    timestampColumns: z.optional(
      z.object({
        createdAt: z.optional(timestampConfig),
        updatedAt: z.optional(timestampConfig),
        deletedAt: z.optional(timestampConfig),
      }),
    ),
    /**
     * Allows the user to have codegen output `Temporal` types (via `temporal-polyfill`) instead of the base JS `Date`
     *
     * Additionally, allows for specifying the default time zone for `Temporal` types when converting dates to/from
     * the database.
     */
    temporal: z.optional(z.union([z.boolean(), z.object({ timeZone: z.string() })])),
    /**
     * By default, we create a `flush_database` function for fast testing.
     *
     * However, if you don't want to use this, or you have your own bespoke function like we do
     * that is more application-aware, then you can disable Joist's out-of-the-box one.
     *
     * If you have more than one test database, you can set `createFlushFunction` to the array
     * of test database names, i.e. `mydb_test_1`, `mydb_test_2`, etc.
     */
    createFlushFunction: z.optional(z.union([z.boolean(), z.array(z.string())])),
    entitiesDirectory: z.string().default("./src/entities"),
    codegenPlugins: z.optional(z.array(z.string())),
    entities: z.record(entityConfig).default({}),
    ignoredTables: z.optional(z.array(z.string())),
    /** The type of entity `id` fields; defaults to `tagged-string`. */
    idType: z.optional(z.union([z.literal("tagged-string"), z.literal("untagged-string"), z.literal("number")])),
    /** How we should support non-deferred foreign keys. */
    nonDeferredForeignKeys: z.optional(z.union([z.literal("error"), z.literal("warn"), z.literal("ignore")])),
    /** Enables esm output. */
    esm: z.optional(z.boolean()),
    /** Auto-set by probing the project's `tsconfig.json` file. */
    allowImportingTsExtensions: z.optional(z.boolean()),
    // The version of Joist that generated this config.
    version: z.string().default("0.0.0"),
    includeSchema: z.array(z.string()).default(['public']),
  })
  .strict();

export type Config = z.infer<typeof config> & {
  // We don't persist this, and instead just use it as a cache
  __tableToEntityName?: Record<string, string>;
};

export const ormMaintainedFields = ["createdAt", "updatedAt"];

/** Ensure the user doesn't have any typos in their config. */
export function warnInvalidConfigEntries(config: Config, db: DbMetadata): void {
  const entitiesByName = groupBy(db.entities, (e) => e.name);
  for (const [entityName, entityConfig] of Object.entries(config.entities)) {
    const entities = entitiesByName[entityName];
    if (!entities) {
      logger.warn(`Found config for non-existent entity ${entityName}`);
      continue;
    }
    // We don't have keyBy...
    const [entity] = entities;

    // Check fields
    const fields = [...entity.primitives, ...entity.enums];
    for (const [name, config] of Object.entries(entityConfig.fields || {})) {
      if (config.ignore) continue;
      let field = fields.find((f) => f.fieldName === name);
      // STI types might be in the base type
      if (!field && entity.stiDiscriminatorField) {
        const stiEntities = getStiEntities(db.entities).get(entity.name)?.subTypes;
        field = stiEntities?.flatMap((st) => [...st.primitives, ...st.enums]).find((f) => f.fieldName === name);
      }
      if (!field) logger.warn(`Found config for non-existent field ${entityName}.${name}`);
    }

    // Check relations
    const relations = [
      ...entity.manyToOnes,
      ...entity.oneToManys,
      ...entity.manyToManys,
      ...entity.oneToOnes,
      ...entity.largeOneToManys,
      ...entity.largeManyToManys,
      ...entity.polymorphics,
    ];
    for (const [name, _] of Object.entries(entityConfig.relations || {})) {
      let relation = relations.find((r) => r.fieldName === name);
      // STI types might be in the subtypes
      if (!relation && entity.stiDiscriminatorField) {
        const stiEntities = getStiEntities(db.entities).get(entity.name)?.subTypes;
        relation = stiEntities
          ?.flatMap((entity) => [
            ...entity.manyToOnes,
            ...entity.oneToManys,
            ...entity.manyToManys,
            ...entity.oneToOnes,
            ...entity.largeOneToManys,
            ...entity.largeManyToManys,
            ...entity.polymorphics,
          ])
          ?.find((f) => f.fieldName === name);
      }
      // CTI subtype specializations (i.e. SmallPublisher.group: SmallPublisherGroup) need to look in the base type
      if (!relation && entity.baseType) {
        const baseType = entity.baseType;
        relation = [
          ...baseType.manyToOnes,
          ...baseType.oneToManys,
          ...baseType.manyToManys,
          ...baseType.oneToOnes,
          ...baseType.largeOneToManys,
          ...baseType.largeManyToManys,
          ...baseType.polymorphics,
        ].find((f) => f.fieldName === name);
      }

      if (!relation) logger.warn(`Found config for non-existent relation ${entityName}.${name}`);
    }
  }
}

export function isGetterField(config: Config, entity: Entity, fieldName: string): boolean {
  return config.entities[entity.name]?.fields?.[fieldName]?.derived === "sync";
}

export function isReactiveField(config: Config, entity: Entity, fieldName: string): boolean {
  return config.entities[entity.name]?.fields?.[fieldName]?.derived === "async";
}

export function isReactiveReference(config: Config, entity: Entity, fieldName: string): boolean {
  return config.entities[entity.name]?.relations?.[fieldName]?.derived === "async";
}

export function isProtected(config: Config, entity: Entity, fieldName: string): boolean {
  return config.entities[entity.name]?.fields?.[fieldName]?.protected === true;
}

export function serdeConfig(config: Config, entity: Entity, fieldName: string): string | undefined {
  return config.entities[entity.name]?.fields?.[fieldName]?.serde;
}

export function superstructConfig(config: Config, entity: Entity, fieldName: string): string | undefined {
  return config.entities[entity.name]?.fields?.[fieldName]?.superstruct;
}

export function zodSchemaConfig(config: Config, entity: Entity, fieldName: string): string | undefined {
  return config.entities[entity.name]?.fields?.[fieldName]?.zodSchema;
}

export function fieldTypeConfig(config: Config, entity: Entity, fieldName: string): string | undefined {
  return config.entities[entity.name]?.fields?.[fieldName]?.type;
}

export function isLargeCollection(config: Config, entity: Entity, fieldName: string): boolean {
  return config.entities[entity.name]?.relations?.[fieldName]?.large === true;
}

export function isFieldIgnored(
  config: Config,
  entity: Entity,
  fieldName: string,
  notNull: boolean = false,
  hasDefault: boolean = false,
): boolean {
  const ignore = config.entities[entity.name]?.fields?.[fieldName]?.ignore === true;
  if (ignore && notNull && !hasDefault) {
    fail(
      `notNull field ${entity.name}.${fieldName} cannot be ignored. Alter the column to be optional or have a default value prior to ignoring it.`,
    );
  }
  return ignore;
}

export function isFieldHasDefault(config: Config, entity: Entity, fieldName: string): boolean {
  const entityConfig = config.entities[entity.name] ?? {};
  const fieldConfig = entityConfig.fields?.[fieldName] ?? entityConfig.relations?.[fieldName] ?? {};
  return fieldConfig.hasDefault === true;
}

const configPath = "./joist-config.json";

export async function loadConfig(): Promise<Config> {
  const exists = await trueIfResolved(fs.access(configPath));
  if (exists) {
    const content = await fs.readFile(configPath);
    const result = config.safeParse(JSON.parse(content.toString()));
    if (!result.success) {
      throw new Error(
        `Invalid joist-config.json: ${result.error.errors
          .map((ze) => `${ze.path.map(String).join("/")} ${ze.message}`)
          .join("\n")}`,
      );
    }
    result.data.allowImportingTsExtensions ??= projectIsUsingEsmWithImports();
    return result.data;
  }
  // This will create the initial `joist-config.json` on the first run, and
  // initialize it with our current Joist version, so that they're not prompted
  // to run any historical codemods.
  const initial = config.parse({ version: getThisVersion() });
  initial.allowImportingTsExtensions ??= projectIsUsingEsmWithImports();
  return initial;
}

function projectIsUsingEsmWithImports(): boolean {
  // Attempt to find the project's tsconfig.json in the current directory or up the directory hierarchy
  const configPath = ts.findConfigFile("./", ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    return false;
  }
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return false;
  }
  return configFile.config?.compilerOptions?.allowImportingTsExtensions === true;
}

/**
 * Writes the potentially-updated config entry back to `joist-config.json`.
 *
 * We format the output with prettier so it should both a) look nice and b) be deterministic,
 * such that no changes to the config show up as noops to the scm.
 */
export async function writeConfig(config: Config): Promise<void> {
  const sorted = sortKeys(config);
  delete sorted.__tableToEntityName;
  delete sorted.allowImportingTsExtensions;
  const input = JSON.stringify(sorted);
  const content = jsonFormatter.formatText("test.json", input);
  await fs.writeFile(configPath, content);
}

export function stripStiPlaceholders(config: Config, entities: EntityDbMetadata[]): void {
  // Defacto (with today's setup) the config of STI entities lives on the base entity,
  // so don't write confusing subtype-specific entries into the config file.
  // ...hopefully we don't have any code accidentally looking for the STI config...
  for (const entity of entities) {
    if (entity.inheritanceType === "sti" && entity.stiDiscriminatorValue) {
      delete config.entities[entity.name];
    }
  }
}

/** Applies defaults to the timestamp config. */
export function getTimestampConfig(config: Config): {
  updatedAtConf: Required<TimestampConfig>;
  createdAtConf: Required<TimestampConfig>;
  deletedAtConf: Required<TimestampConfig>;
} {
  return {
    createdAtConf: {
      names: ["created_at", "createdAt"],
      required: false,
      ...config?.timestampColumns?.createdAt,
    },
    updatedAtConf: {
      names: ["updated_at", "updatedAt"],
      required: false,
      ...config?.timestampColumns?.updatedAt,
    },
    deletedAtConf: {
      names: ["deleted_at", "deletedAt"],
      required: false,
      ...config?.timestampColumns?.deletedAt,
    },
  };
}
