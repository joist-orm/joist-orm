import { camelCase, pascalCase } from "change-case";
import { code, Code, imp, joinCode } from "ts-poet";
import { Config } from "./config";
import { DbMetadata, EntityDbMetadata, EnumField, PrimitiveField, PrimitiveTypescriptType } from "./EntityDbMetadata";
import { keywords } from "./keywords";
import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  Collection,
  ConfigApi,
  deTagId,
  Entity,
  EntityFilter,
  EntityGraphQLFilter,
  EntityMetadata,
  EntityOrmField,
  fail as failSymbol,
  FieldsOf,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  hasLargeMany,
  hasLargeManyToMany,
  hasMany,
  hasManyToMany,
  hasOne,
  hasOnePolymorphic,
  hasOneToOne,
  IdOf,
  isLoaded,
  LargeCollection,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToOneReference,
  MaybeAbstractEntityConstructor,
  newChangesProxy,
  newRequiredRule,
  OneToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  PersistedAsyncProperty,
  PolymorphicReference,
  setField,
  setOpts,
  SSAssert,
  ValueFilter,
  ValueGraphQLFilter,
} from "./symbols";
import { fail, uncapitalize } from "./utils";

export interface ColumnMetaData {
  fieldType: PrimitiveTypescriptType;
}

/** Creates the base class with the boilerplate annotations. */
export function generateEntityCodegenFile(config: Config, dbMeta: DbMetadata, meta: EntityDbMetadata): Code {
  const { entity, tagName } = meta;
  const entityName = entity.name;

  // Avoid using `do` as a variable name b/c it's a reserved keyword
  const varName = keywords.includes(tagName) ? uncapitalize(entityName) : tagName;

  // Add the primitives
  const primitives = meta.primitives.map((p) => {
    const { fieldName, fieldType, notNull } = p;
    const maybeOptional = notNull ? "" : " | undefined";

    let getter: Code;
    if (p.derived === "async") {
      getter = code`
        abstract readonly ${fieldName}: ${PersistedAsyncProperty}<${entity.name}, ${p.fieldType}${maybeOptional}>;
     `;
    } else if (p.derived === "sync") {
      getter = code`
        abstract get ${fieldName}(): ${fieldType}${maybeOptional};
     `;
    } else {
      getter = code`
        get ${fieldName}(): ${fieldType}${maybeOptional} {
          return this.__orm.data["${fieldName}"];
        }
     `;
    }

    let setter: Code | string;
    if (p.protected) {
      // TODO Allow making the getter to be protected as well. And so probably remove it
      // from the Opts as well. Wonder how that works for required protected fields?
      //
      // We have to use a method of `set${fieldName}` because TS enforces getters/setters to have
      // same access level and currently we're leaving the getter as public.
      setter = code`
        protected set${pascalCase(fieldName)}(${fieldName}: ${fieldType}${maybeOptional}) {
          ${setField}(this, "${fieldName}", ${fieldName});
        }
      `;
    } else if (p.derived) {
      setter = "";
    } else if (p.superstruct) {
      setter = code`
        set ${fieldName}(_${fieldName}: ${fieldType}${maybeOptional}) {
          if (_${fieldName}) {
            ${SSAssert}(_${fieldName}, ${p.superstruct});
          }
          ${setField}(this, "${fieldName}", _${fieldName});
        }
      `;
    } else {
      setter = code`
        set ${fieldName}(${fieldName}: ${fieldType}${maybeOptional}) {
          ${setField}(this, "${fieldName}", ${fieldName});
        }
      `;
    }

    return code`${getter} ${setter}`;
  });

  // Add ManyToOne enums
  meta.enums
    .filter((e) => !e.isArray)
    .forEach((e) => {
      const { fieldName, enumType, enumDetailType, enumDetailsType, notNull, enumRows } = e;
      const maybeOptional = notNull ? "" : " | undefined";
      const getByCode = code`${enumDetailType}.getByCode(this.${fieldName})`;
      const getter = code`
        get ${fieldName}(): ${enumType}${maybeOptional} {
          return this.__orm.data["${fieldName}"];
        }

        get ${fieldName}Details(): ${enumDetailsType}${maybeOptional} {
          return ${notNull ? getByCode : code`this.${fieldName} ? ${getByCode} : undefined`};
        }
     `;
      const setter = code`
        set ${fieldName}(${fieldName}: ${enumType}${maybeOptional}) {
          ${setField}(this, "${fieldName}", ${fieldName});
        }
      `;

      const codes = new Set(enumRows.map((r) => r.code));
      const shouldPrefixAccessors = meta.enums
        .filter((other) => other !== e)
        .some((other) => other.enumRows.some((r) => codes.has(r.code)));

      const accessors = enumRows.map(
        (row) => code`
          get is${shouldPrefixAccessors ? pascalCase(fieldName) : ""}${pascalCase(row.code)}(): boolean {
            return this.__orm.data["${fieldName}"] === ${enumType}.${pascalCase(row.code)};
          }
        `,
      );
      // Group enums as primitives
      primitives.push(getter, setter, ...accessors);
    });

  // Add integer[] enums
  meta.enums
    .filter((e) => e.isArray)
    .forEach((e) => {
      const { fieldName, enumType, enumDetailType, enumDetailsType, enumRows } = e;
      const getter = code`
        get ${fieldName}(): ${enumType}[] {
          return this.__orm.data["${fieldName}"] || [];
        }

        get ${fieldName}Details(): ${enumDetailsType}[] {
          return this.${fieldName}.map(code => ${enumDetailType}.getByCode(code));
        }
     `;
      const setter = code`
        set ${fieldName}(${fieldName}: ${enumType}[]) {
          ${setField}(this, "${fieldName}", ${fieldName});
        }
      `;

      const codes = new Set(enumRows.map((r) => r.code));
      const shouldPrefixAccessors = meta.enums
        .filter((other) => other !== e)
        .some((other) => other.enumRows.some((r) => codes.has(r.code)));

      const accessors = enumRows.map(
        (row) => code`
          get is${shouldPrefixAccessors ? pascalCase(fieldName) : ""}${pascalCase(row.code)}(): boolean {
            return this.${fieldName}.includes(${enumType}.${pascalCase(row.code)});
          }
        `,
      );
      // Group enums as primitives
      primitives.push(getter, setter, ...accessors);
    });

  meta.pgEnums.forEach((e) => {
    const { fieldName, enumType, enumValues, notNull } = e;
    const maybeOptional = notNull ? "" : " | undefined";

    const getter = code`
        get ${fieldName}(): ${enumType}${maybeOptional} {
          return this.__orm.data["${fieldName}"];
        }
     `;
    const setter = code`
        set ${fieldName}(${fieldName}: ${enumType}${maybeOptional}) {
          ${setField}(this, "${fieldName}", ${fieldName});
        }
      `;

    const codes = new Set(enumValues);
    const shouldPrefixAccessors = meta.pgEnums
      .filter((other) => other !== e)
      .some((other) => other.enumValues.some((r) => codes.has(r)));

    const accessors = enumValues.map(
      (row) => code`
          get is${shouldPrefixAccessors ? pascalCase(fieldName) : ""}${pascalCase(row)}(): boolean {
            return this.${fieldName} === ${enumType}.${pascalCase(row)};
          }
        `,
    );
    // Group enums as primitives
    primitives.push(getter, setter, ...accessors);
  });

  // Add ManyToOne entities
  const m2o = meta.manyToOnes.map((m2o) => {
    const { fieldName, otherEntity, otherFieldName, notNull } = m2o;
    const maybeOptional = notNull ? "never" : "undefined";
    return code`
      readonly ${fieldName}: ${ManyToOneReference}<${entity.type}, ${otherEntity.type}, ${maybeOptional}> =
        ${hasOne}(
          ${otherEntity.metaType},
          "${fieldName}",
          "${otherFieldName}",
        );
    `;
  });

  // Add OneToMany
  const o2m = meta.oneToManys.map((o2m) => {
    const { fieldName, otherFieldName, otherColumnName, otherEntity, orderBy } = o2m;
    return code`
      readonly ${fieldName}: ${Collection}<${entity.type}, ${otherEntity.type}> = ${hasMany}(
        ${otherEntity.metaType},
        "${fieldName}",
        "${otherFieldName}",
        "${otherColumnName}",
        ${orderBy},
      );
    `;
  });

  // Add large OneToMany
  const lo2m = meta.largeOneToManys.map((o2m) => {
    const { fieldName, otherFieldName, otherColumnName, otherEntity } = o2m;
    return code`
      readonly ${fieldName}: ${LargeCollection}<${entity.type}, ${otherEntity.type}> = ${hasLargeMany}(
        ${otherEntity.metaType},
        "${fieldName}",
        "${otherFieldName}",
        "${otherColumnName}"
      );
    `;
  });

  // Add OneToOne
  const o2o = meta.oneToOnes.map((o2o) => {
    const { fieldName, otherEntity, otherFieldName, otherColumnName } = o2o;
    return code`
      readonly ${fieldName}: ${OneToOneReference}<${entity.type}, ${otherEntity.type}> =
        ${hasOneToOne}(
          ${otherEntity.metaType},
          "${fieldName}",
          "${otherFieldName}",
          "${otherColumnName}",
        );
    `;
  });

  // Add ManyToMany
  const m2m = meta.manyToManys.map((m2m) => {
    const { joinTableName, fieldName, columnName, otherEntity, otherFieldName, otherColumnName } = m2m;
    return code`
      readonly ${fieldName}: ${Collection}<${entity.type}, ${otherEntity.type}> = ${hasManyToMany}(
        "${joinTableName}",
        "${fieldName}",
        "${columnName}",
        ${otherEntity.metaType},
        "${otherFieldName}",
        "${otherColumnName}",
      );
    `;
  });

  // Add large ManyToMany
  const lm2m = meta.largeManyToManys.map((m2m) => {
    const { joinTableName, fieldName, columnName, otherEntity, otherFieldName, otherColumnName } = m2m;
    return code`
      readonly ${fieldName}: ${LargeCollection}<${entity.type}, ${otherEntity.type}> = ${hasLargeManyToMany}(
        "${joinTableName}",
        "${fieldName}",
        "${columnName}",
        ${otherEntity.metaType},
        "${otherFieldName}",
        "${otherColumnName}",
      );
    `;
  });

  // Add Polymorphic
  const polymorphic = meta.polymorphics.map((p) => {
    const { fieldName, notNull, fieldType } = p;
    const maybeOptional = notNull ? "never" : "undefined";
    return code`
      readonly ${fieldName}: ${PolymorphicReference}<${entity.type}, ${fieldType}, ${maybeOptional}> = ${hasOnePolymorphic}(
        "${fieldName}",
      );
    `;
  });

  const configName = `${camelCase(entityName)}Config`;
  const metadata = imp(`${camelCase(entityName)}Meta@./entities`);

  const defaultValues = generateDefaultValues(config, meta);

  const contextType = config.contextType ? imp(config.contextType) : "{}";
  const factoryMethod = imp(`new${entity.name}@./entities`);
  const EntityManager = imp("t:EntityManager@./entities");

  const idCode =
    config.idType === "untagged-string"
      ? code`return ${deTagId}(${metadata}, this.idTagged);`
      : code`return this.idTagged;`;

  const maybeIsSoftDeleted = meta.deletedAt
    ? code`
    get isSoftDeletedEntity(): boolean {
      return this.__orm.data.${meta.deletedAt.fieldName} !== undefined;
    }
  `
    : "";

  // Set up the codegen artifacts to extend from the base type if necessary
  const baseEntity = meta.baseClassName ? dbMeta.entities.find((e) => e.name === meta.baseClassName)! : undefined;
  const subEntities = dbMeta.entities.filter((e) => e.baseClassName === meta.name);
  const base = baseEntity?.entity.type ?? code`${BaseEntity}<${EntityManager}>`;
  const maybeBaseFields = baseEntity ? code`extends ${imp(baseEntity.name + "Fields@./entities")}` : "";
  const maybeBaseOpts = baseEntity ? code`extends ${baseEntity.entity.optsType}` : "";
  const maybeBaseIdOpts = baseEntity ? code`extends ${imp(baseEntity.name + "IdsOpts@./entities")}` : "";
  const maybeBaseFilter = baseEntity ? code`extends ${imp(baseEntity.name + "Filter@./entities")}` : "";
  const maybeBaseGqlFilter = baseEntity ? code`extends ${imp(baseEntity.name + "GraphQLFilter@./entities")}` : "";
  const maybeBaseOrder = baseEntity ? code`extends ${baseEntity.entity.orderType}` : "";
  const maybeBaseId = baseEntity ? code` & Flavor<string, "${baseEntity.name}">` : "";
  const maybePreventBaseTypeInstantiation = meta.abstract
    ? code`
    if (this.constructor === ${entity.type} && !(em as any).fakeInstance) {
      throw new Error(\`${entity.type} \${typeof opts === "string" ? opts : ""} must be instantiated via a subtype\`);
    }`
    : "";

  let cstr;
  if (baseEntity) {
    cstr = code`
      constructor(em: ${EntityManager}, opts: ${entityName}Opts) {
        // @ts-ignore
        super(em, ${metadata}, ${entityName}Codegen.defaultValues, opts);
        ${setOpts}(this as any as ${entityName}, opts, { calledFromConstructor: true });
        ${maybePreventBaseTypeInstantiation}
      }
    `;
  } else if (subEntities.length > 0) {
    cstr = code`
      constructor(em: ${EntityManager}, opts: ${entityName}Opts) {
        if (arguments.length === 4) {
          // @ts-ignore
          super(em, arguments[1], { ...arguments[2], ...${entityName}Codegen.defaultValues }, arguments[3]);
        } else {
          super(em, ${metadata}, ${entityName}Codegen.defaultValues, opts);
          ${setOpts}(this as any as ${entityName}, opts, { calledFromConstructor: true });
        }
        ${maybePreventBaseTypeInstantiation}
      }
    `;
  } else {
    cstr = code`
      constructor(em: ${EntityManager}, opts: ${entityName}Opts) {
        super(em, ${metadata}, ${entityName}Codegen.defaultValues, opts);
        ${setOpts}(this as any as ${entityName}, opts, { calledFromConstructor: true });
        ${maybePreventBaseTypeInstantiation}
      }
    `;
  }

  let maybeOtherTypeChanges;
  if (subEntities.length > 0) {
    maybeOtherTypeChanges = joinCode(
      // Pass `K = keyof Publisher | keyof SmallPublisher | keyof LargePublisher` to `changes` so that
      // our subtypes can have `SmallPublisher.changes(): Changes<SmallPublisher>` be covariant, which
      // will break if it adds a key to `Changes.fields` that `Publisher.changes()` does not include.
      //
      // type A1 = { foo: 1 | 2 };
      // type A2 = { foo: 1 | 2 | 3 };
      // type A3 = A2 extends A1 ? 1 : 2;
      //
      // A3 will be 2 because the extra 3 breaks code written against A1.foo.
      //
      // So essentially we're pre-emptively our subtypes "3".
      [code`, `, ...[meta, ...subEntities].map((e) => code`keyof ${FieldsOf}<${e.entity.type}>`)],
      { on: "|" },
    );
  } else {
    maybeOtherTypeChanges = "";
  }

  let maybeOtherLoaded;
  if (baseEntity) {
    maybeOtherLoaded = code`| ${baseEntity.entity.type}`;
  } else {
    maybeOtherLoaded = "";
  }

  return code`
    export type ${entityName}Id = ${Flavor}<string, "${entityName}"> ${maybeBaseId};

    ${generatePolymorphicTypes(meta)}
    
    export interface ${entityName}Fields ${maybeBaseFields} {
      ${generateFieldsType(config, meta)}
    }

    export interface ${entityName}Opts ${maybeBaseOpts} {
      ${generateOptsFields(config, meta)}
    }

    export interface ${entityName}IdsOpts ${maybeBaseIdOpts} {
      ${generateOptIdsFields(config, meta)}
    }

    export interface ${entityName}Filter ${maybeBaseFilter} {
      ${generateFilterFields(meta)}
    }

    export interface ${entityName}GraphQLFilter ${maybeBaseGqlFilter} {
      ${generateGraphQLFilterFields(meta)}
    }

    export interface ${entityName}Order ${maybeBaseOrder} {
      ${generateOrderFields(meta)}
    }

    export const ${configName} = new ${ConfigApi}<${entity.type}, ${contextType}>();

    ${generateDefaultValidationRules(meta, configName)}
    
    export abstract class ${entityName}Codegen extends ${base} {
      static defaultValues: object = {
        ${defaultValues}
      };
      static readonly tagName = "${tagName}";
      static readonly metadata: ${EntityMetadata}<${entityName}>;

      declare readonly __orm: ${EntityOrmField} & {
        filterType: ${entityName}Filter;
        gqlFilterType: ${entityName}GraphQLFilter;
        orderType: ${entityName}Order;
        optsType: ${entityName}Opts;
        fieldsType: ${entityName}Fields;
        optIdsType: ${entityName}IdsOpts;
        factoryOptsType: Parameters<typeof ${factoryMethod}>[1];
      };
      ${[o2m, lo2m, m2o, o2o, m2m, lm2m, polymorphic]}

      ${cstr}

      get id(): ${entityName}Id | undefined {
        ${idCode}
      }

      get idOrFail(): ${entityName}Id {
        return this.id || ${failSymbol}("${entityName} has no id yet");
      }

      get idTagged(): ${entityName}Id | undefined {
        return this.__orm.data["id"];
      }

      get idTaggedOrFail(): ${entityName}Id {
        return this.idTagged || ${failSymbol}("${entityName} has no id tagged yet");
      }

      ${primitives}

      set(opts: Partial<${entityName}Opts>): void {
        ${setOpts}(this as any as ${entityName}, opts);
      }

      setPartial(opts: ${PartialOrNull}<${entityName}Opts>): void {
        ${setOpts}(this as any as ${entityName}, opts as ${OptsOf}<${entityName}>, { partial: true });
      }

      get changes(): ${Changes}<${entityName}${maybeOtherTypeChanges}> {
        return ${newChangesProxy}(this) as any;
      }

      ${maybeIsSoftDeleted}

      load<U, V>(fn: (lens: ${Lens}<${entity.type}>) => ${Lens}<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
        return ${loadLens}(this as any as ${entityName}, fn, opts);
      }

      populate<H extends ${LoadHint}<${entityName}>>(hint: H): Promise<${Loaded}<${entityName}, H>>;
      populate<H extends ${LoadHint}<${entityName}>>(opts: { hint: H, forceReload?: boolean }): Promise<${Loaded}<${entityName}, H>>;
      populate<H extends ${LoadHint}<${entityName}>, V>(hint: H, fn: (${varName}: Loaded<${entityName}, H>) => V): Promise<V>;
      populate<H extends ${LoadHint}<${entityName}>, V>(opts: { hint: H, forceReload?: boolean }, fn: (${varName}: Loaded<${entityName}, H>) => V): Promise<V>;
      populate<H extends ${LoadHint}<${entityName}>, V>(hintOrOpts: any, fn?: (${varName}: Loaded<${entityName}, H>) => V): Promise<${Loaded}<${entityName}, H> | V> {
        return this.em.populate(this as any as ${entityName}, hintOrOpts, fn);
      }

      isLoaded<H extends ${LoadHint}<${entityName}>>(hint: H): this is ${Loaded}<${entityName}${maybeOtherLoaded}, H> {
        return ${isLoaded}(this as any as ${entityName}, hint);
      }
    }
  `;
}

function fieldHasDefaultValue(field: PrimitiveField | EnumField): boolean {
  let { columnDefault } = field;

  // if there's no default at all, return false
  if (columnDefault === null) {
    return false;
  }

  // even though default is defined as a number | boolean | string | null in reality pg-structure
  // only ever returns a string | null so we make sure of that here
  columnDefault = columnDefault.toString();

  // if this value should be set elsewhere, return false
  if (field.kind === "primitive" && field.derived !== false) {
    return false;
  }

  const fieldType = field.kind === "primitive" ? field.fieldType : "number";

  // try to validate that we actually got a primitive value and not arbitrary SQL
  return (
    (fieldType === "number" && !isNaN(parseInt(columnDefault))) ||
    (fieldType === "string" && /^'.*'$/.test(columnDefault)) ||
    (fieldType === "boolean" && ["true", "false"].includes(columnDefault))
  );
}

function generatePolymorphicTypes(meta: EntityDbMetadata) {
  return meta.polymorphics.flatMap((pf) => [
    code`export type ${pf.fieldType} = ${pf.components.map((c) => code`| ${c.otherEntity.type}`)};`,
    code`export function get${pf.fieldType}Constructors(): ${MaybeAbstractEntityConstructor}<${pf.fieldType}>[] {
      return [${pf.components.map((c) => code`${c.otherEntity.type},`)}];
    }`,
    code`export function is${pf.fieldType}(maybeEntity: ${Entity} | undefined | null): maybeEntity is ${pf.fieldType} {
      return maybeEntity !== undefined && maybeEntity !== null && get${pf.fieldType}Constructors().some((type) => maybeEntity instanceof type);
    }`,
  ]);
}

function generateDefaultValues(config: Config, meta: EntityDbMetadata): Code[] {
  const primitives = meta.primitives
    .filter((field) => fieldHasDefaultValue(field))
    .map(({ fieldName, columnDefault }) => {
      return code`${fieldName}: ${columnDefault},`;
    });
  const pgEnums = meta.pgEnums
    .filter((field) => !!field.columnDefault)
    .map(({ fieldName, columnDefault }) => {
      return code`${fieldName}: ${columnDefault},`;
    });
  const enums = meta.enums
    .filter((field) => !!field.columnDefault && !field.isArray)
    .map(({ fieldName, columnDefault, enumRows, enumType, columnName }) => {
      const defaultRow =
        enumRows.find((r) => r.id === Number(columnDefault)) ||
        fail(`Invalid default value ${columnDefault} for ${meta.tableName}.${columnName}`);
      return code`${fieldName}: ${enumType}.${pascalCase(defaultRow.code)},`;
    });
  return [...primitives, ...enums, ...pgEnums];
}

function generateDefaultValidationRules(meta: EntityDbMetadata, configName: string): Code[] {
  const fields = [...meta.primitives, ...meta.enums, ...meta.manyToOnes, ...meta.polymorphics];
  return fields
    .filter((p) => p.notNull)
    .map(({ fieldName }) => {
      return code`${configName}.addRule(${newRequiredRule}("${fieldName}"));`;
    });
}

// Make our opts type
function generateOptsFields(config: Config, meta: EntityDbMetadata): Code[] {
  const primitives = meta.primitives.map((field) => {
    const { fieldName, fieldType, notNull, derived } = field;
    if (derived) {
      return code``;
    }
    return code`${fieldName}${maybeOptionalOrDefault(field)}: ${fieldType}${maybeUnionNull(notNull)};`;
  });
  const enums = meta.enums.map((field) => {
    const { fieldName, enumType, notNull, isArray } = field;
    if (isArray) {
      // Arrays are always optional and we'll default to `[]`
      return code`${fieldName}?: ${enumType}[];`;
    } else {
      return code`${fieldName}${maybeOptionalOrDefault(field)}: ${enumType}${maybeUnionNull(notNull)};`;
    }
  });
  const pgEnums = meta.pgEnums.map(({ fieldName, enumType, notNull }) => {
    return code`${fieldName}${maybeOptional(notNull)}: ${enumType}${maybeUnionNull(notNull)};`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    const maybeNull = maybeUnionNull(notNull);
    return code`${fieldName}${maybeOptional(notNull)}: ${otherEntity.type} | ${otherEntity.idType} ${maybeNull};`;
  });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.type} | null;`;
  });
  const o2m = meta.oneToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.type}[];`;
  });
  const m2m = meta.manyToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.type}[];`;
  });
  const polys = meta.polymorphics.map(({ fieldName, notNull, fieldType }) => {
    return code`${fieldName}${maybeOptional(notNull)}: ${fieldType};`;
  });
  return [...primitives, ...enums, ...pgEnums, ...m2o, ...polys, ...o2o, ...o2m, ...m2m];
}

// Make our fields type
function generateFieldsType(config: Config, meta: EntityDbMetadata): Code[] {
  const id = code`id: { kind: "primitive"; type: ${meta.primaryKey.fieldType}; unique: ${true}; nullable: false };`;
  const primitives = meta.primitives.map((field) => {
    const { fieldName, fieldType, notNull, unique } = field;
    return code`${fieldName}: { kind: "primitive"; type: ${fieldType}; unique: ${unique}; nullable: ${undefinedOrNever(
      notNull,
    )} };`;
  });
  const enums = meta.enums.map((field) => {
    const { fieldName, enumType, notNull, isArray } = field;
    if (isArray) {
      // Arrays are always optional and we'll default to `[]`
      return code`${fieldName}: { kind: "enum"; type: ${enumType}[]; nullable: never };`;
    } else {
      return code`${fieldName}: { kind: "enum"; type: ${enumType}; nullable: ${undefinedOrNever(notNull)} };`;
    }
  });
  const pgEnums = meta.pgEnums.map(({ fieldName, enumType, notNull }) => {
    const nullable = undefinedOrNever(notNull);
    return code`${fieldName}: { kind: "enum"; type: ${enumType}; nullable: ${nullable}; native: true };`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}: { kind: "m2o"; type: ${otherEntity.type}; nullable: ${undefinedOrNever(notNull)} };`;
  });
  const polys = meta.polymorphics.map(({ fieldName, notNull, fieldType }) => {
    return code`${fieldName}: { kind: "poly"; type: ${fieldType}; nullable: ${undefinedOrNever(notNull)} };`;
  });
  return [id, ...primitives, ...enums, ...pgEnums, ...m2o, ...polys];
}

// We know the OptIds types are only used in partials, so we make everything optional.
// This especially needs to be the case b/c both `book: ...` and `bookId: ...` will be
// in the partial type and of course the caller will only be setting one.
function generateOptIdsFields(config: Config, meta: EntityDbMetadata): Code[] {
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}Id?: ${otherEntity.idType} | null;`;
  });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}Id?: ${otherEntity.idType} | null;`;
  });
  const o2m = meta.oneToManys.map(({ singularName, otherEntity }) => {
    return code`${singularName}Ids?: ${otherEntity.idType}[] | null;`;
  });
  const m2m = meta.manyToManys.map(({ singularName, otherEntity }) => {
    return code`${singularName}Ids?: ${otherEntity.idType}[] | null;`;
  });
  const polys = meta.polymorphics.map(({ fieldName, fieldType }) => {
    return code`${fieldName}Id?:  ${IdOf}<${fieldType}> | null;`;
  });
  return [...m2o, ...polys, ...o2o, ...o2m, ...m2m];
}

function generateFilterFields(meta: EntityDbMetadata): Code[] {
  const maybeId = meta.baseClassName ? [] : [code`id?: ${ValueFilter}<${meta.entity.name}Id, never>;`];
  const primitives = meta.primitives.map(({ fieldName, fieldType, notNull }) => {
    if (fieldType === "boolean") {
      return code`${fieldName}?: ${BooleanFilter}<${nullOrNever(notNull)}>;`;
    } else {
      return code`${fieldName}?: ${ValueFilter}<${fieldType}, ${nullOrNever(notNull)}>;`;
    }
  });
  const enums = meta.enums.map(({ fieldName, enumType, notNull, isArray }) => {
    const maybeArray = isArray ? "[]" : "";
    return code`${fieldName}?: ${ValueFilter}<${enumType}${maybeArray}, ${nullOrNever(notNull)}>;`;
  });
  const pgEnums = meta.pgEnums.map(({ fieldName, enumType, notNull }) => {
    return code`${fieldName}?: ${ValueFilter}<${enumType}, ${nullOrNever(notNull)}>;`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${
      otherEntity.type
    }>, ${nullOrNever(notNull)}>;`;
  });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const o2m = meta.oneToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const m2m = meta.manyToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const polys = meta.polymorphics.map(({ fieldName, fieldType }) => {
    return code`${fieldName}?: ${EntityFilter}<${fieldType}, ${IdOf}<${fieldType}>, never, null | undefined>;`;
  });
  return [...maybeId, ...primitives, ...enums, ...pgEnums, ...m2o, ...o2o, ...o2m, ...m2m, ...polys];
}

function generateGraphQLFilterFields(meta: EntityDbMetadata): Code[] {
  const maybeId = meta.baseClassName ? [] : [code`id?: ${ValueGraphQLFilter}<${meta.entity.name}Id>;`];
  const primitives = meta.primitives.map(({ fieldName, fieldType }) => {
    if (fieldType === "boolean") {
      return code`${fieldName}?: ${BooleanGraphQLFilter};`;
    } else {
      return code`${fieldName}?: ${ValueGraphQLFilter}<${fieldType}>;`;
    }
  });
  const enums = meta.enums.map(({ fieldName, enumType, isArray }) => {
    const maybeArray = isArray ? "[]" : "";
    return code`${fieldName}?: ${ValueGraphQLFilter}<${enumType}${maybeArray}>;`;
  });
  const pgEnums = meta.pgEnums.map(({ fieldName, enumType }) => {
    return code`${fieldName}?: ${ValueGraphQLFilter}<${enumType}>;`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${
      otherEntity.type
    }>, ${nullOrNever(notNull)}>;`;
  });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const o2m = meta.oneToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const m2m = meta.manyToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const polys = meta.polymorphics.map(({ fieldName, fieldType }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${fieldType}, ${IdOf}<${fieldType}>, never, null | undefined>;`;
  });
  return [...maybeId, ...primitives, ...enums, ...pgEnums, ...m2o, ...o2o, ...o2m, ...m2m, ...polys];
}

function generateOrderFields(meta: EntityDbMetadata): Code[] {
  const maybeId = meta.baseClassName ? [] : [code`id?: ${OrderBy};`];
  const primitives = meta.primitives.map(({ fieldName }) => {
    return code`${fieldName}?: ${OrderBy};`;
  });
  const enums = meta.enums.map(({ fieldName }) => {
    return code`${fieldName}?: ${OrderBy};`;
  });
  const pgEnums = meta.pgEnums.map(({ fieldName }) => {
    return code`${fieldName}?: ${OrderBy};`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.orderType};`;
  });
  return [...maybeId, ...primitives, ...enums, ...pgEnums, ...m2o];
}

function maybeOptional(notNull: boolean): string {
  return notNull ? "" : "?";
}

function maybeOptionalOrDefault(field: PrimitiveField | EnumField): string {
  return field.notNull && !fieldHasDefaultValue(field) ? "" : "?";
}

function maybeUnionNull(notNull: boolean): string {
  return notNull ? "" : " | null";
}

function maybeUndefined(notNull: boolean): string {
  return notNull ? "" : " | undefined";
}

function undefinedOrNever(notNull: boolean): string {
  return notNull ? "never" : "undefined";
}

function nullOrNever(notNull: boolean): string {
  return notNull ? "never" : "null";
}
