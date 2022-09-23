import { camelCase, pascalCase } from "change-case";
import { code, Code, imp } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata, EnumField, PrimitiveField, PrimitiveTypescriptType } from "./EntityDbMetadata";
import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  Collection,
  ConfigApi,
  deTagId,
  Entity,
  EntityConstructor,
  EntityFilter,
  EntityGraphQLFilter,
  EntityOrmField,
  EnumGraphQLFilter,
  fail as failSymbol,
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
import { fail } from "./utils";

export interface ColumnMetaData {
  fieldType: PrimitiveTypescriptType;
}

/** Creates the base class with the boilerplate annotations. */
export function generateEntityCodegenFile(config: Config, meta: EntityDbMetadata): Code {
  const { entity, tagName } = meta;
  const entityName = entity.name;

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
          /** @ignore */
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
          /** @ignore */
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
    const { fieldName, otherFieldName, otherColumnName, otherEntity } = o2m;
    return code`
      readonly ${fieldName}: ${Collection}<${entity.type}, ${otherEntity.type}> = ${hasMany}(
        ${otherEntity.metaType},
        "${fieldName}",
        "${otherFieldName}",
        "${otherColumnName}"
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

  return code`
    /** @ignore */
    export type ${entityName}Id = ${Flavor}<string, "${entityName}">;

    ${generatePolymorphicTypes(meta)}
    
    /** @ignore */
    export interface ${entityName}Fields {
      ${generateFieldsType(config, meta)}
    }

    /** @ignore */
    export interface ${entityName}Opts {
      ${generateOptsFields(config, meta)}
    }

    /** @ignore */
    export interface ${entityName}IdsOpts {
      ${generateOptIdsFields(config, meta)}
    }

    /** @ignore */
    export interface ${entityName}Filter {
      id?: ${ValueFilter}<${entityName}Id, never>;
      ${generateFilterFields(meta)}
    }

    /** @ignore */
    export interface ${entityName}GraphQLFilter {
      id?: ${ValueGraphQLFilter}<${entityName}Id>;
      ${generateGraphQLFilterFields(meta)}
    }

    /** @ignore */
    export interface ${entityName}Order {
      id?: ${OrderBy};
      ${generateOrderFields(meta)}
    }

    /** @ignore */
    export const ${configName} = new ${ConfigApi}<${entity.type}, ${contextType}>();

    ${generateDefaultValidationRules(meta, configName)}

    export abstract class ${entityName}Codegen extends ${BaseEntity}<${EntityManager}> {
      static defaultValues: object = {
        ${defaultValues}
      };

      /** @ignore */
      readonly __orm!: ${EntityOrmField} & {
        filterType: ${entityName}Filter;
        gqlFilterType: ${entityName}GraphQLFilter;
        orderType: ${entityName}Order;
        optsType: ${entityName}Opts;
        fieldsType: ${entityName}Fields;
        optIdsType: ${entityName}IdsOpts;
        factoryOptsType: Parameters<typeof ${factoryMethod}>[1];
      };
      ${[o2m, lo2m, m2o, o2o, m2m, lm2m, polymorphic]}

      constructor(em: ${EntityManager}, opts: ${entityName}Opts) {
        super(em, ${metadata}, ${entityName}Codegen.defaultValues, opts);
        ${setOpts}(this as any as ${entityName}, opts, { calledFromConstructor: true });
      }

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

      get changes(): ${Changes}<${entityName}> {
        return ${newChangesProxy}(this as any as ${entityName});
      }

      load<U, V>(fn: (lens: ${Lens}<${entity.type}>) => ${Lens}<U, V>): Promise<V> {
        return ${loadLens}(this as any as ${entityName}, fn);
      }

      populate<H extends ${LoadHint}<${entityName}>>(hint: H): Promise<${Loaded}<${entityName}, H>>;
      populate<H extends ${LoadHint}<${entityName}>>(opts: { hint: H, forceReload?: boolean }): Promise<${Loaded}<${entityName}, H>>;
      populate<H extends ${LoadHint}<${entityName}>, V>(hint: H, fn: (${tagName}: Loaded<${entityName}, H>) => V): Promise<V>;
      populate<H extends ${LoadHint}<${entityName}>, V>(opts: { hint: H, forceReload?: boolean }, fn: (${tagName}: Loaded<${entityName}, H>) => V): Promise<V>;
      populate<H extends ${LoadHint}<${entityName}>, V>(hintOrOpts: any, fn?: (${tagName}: Loaded<${entityName}, H>) => V): Promise<${Loaded}<${entityName}, H> | V> {
        return this.em.populate(this as any as ${entityName}, hintOrOpts, fn);
      }

      isLoaded<H extends ${LoadHint}<${entityName}>>(hint: H): this is ${Loaded}<${entityName}, H> {
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
    code`export function get${pf.fieldType}Constructors(): ${EntityConstructor}<${pf.fieldType}>[] {
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
  const primitives = meta.primitives.map((field) => {
    const { fieldName, fieldType, notNull, derived } = field;
    if (derived) {
      return code``;
    }
    return code`${fieldName}: ${fieldType}${maybeUndefined(notNull)};`;
  });
  const enums = meta.enums.map((field) => {
    const { fieldName, enumType, notNull, isArray } = field;
    if (isArray) {
      // Arrays are always optional and we'll default to `[]`
      return code`${fieldName}: ${enumType}[];`;
    } else {
      return code`${fieldName}: ${enumType}${maybeUndefined(notNull)};`;
    }
  });
  const pgEnums = meta.pgEnums.map(({ fieldName, enumType, notNull }) => {
    return code`${fieldName}: ${enumType}${maybeUndefined(notNull)};`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}: ${otherEntity.type}${maybeUndefined(notNull)};`;
  });
  const polys = meta.polymorphics.map(({ fieldName, notNull, fieldType }) => {
    return code`${fieldName}: ${fieldType}${maybeUndefined(notNull)}`;
  });
  return [...primitives, ...enums, ...pgEnums, ...m2o, ...polys];
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
    const maybeArray = "";
    return code`${fieldName}?: ${ValueFilter}<${enumType}${maybeArray}, ${nullOrNever(notNull)}>;`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${
      otherEntity.type
    }>, ${nullOrNever(notNull)}>;`;
  });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const polys = meta.polymorphics.map(({ fieldName, fieldType }) => {
    return code`${fieldName}?: ${EntityFilter}<${fieldType}, ${IdOf}<${fieldType}>, never, null | undefined>;`;
  });
  return [...primitives, ...enums, ...pgEnums, ...m2o, ...o2o, ...polys];
}

function generateGraphQLFilterFields(meta: EntityDbMetadata): Code[] {
  const primitives = meta.primitives.map(({ fieldName, fieldType }) => {
    if (fieldType === "boolean") {
      return code`${fieldName}?: ${BooleanGraphQLFilter};`;
    } else {
      return code`${fieldName}?: ${ValueGraphQLFilter}<${fieldType}>;`;
    }
  });
  const enums = meta.enums.map(({ fieldName, enumType }) => {
    return code`${fieldName}?: ${EnumGraphQLFilter}<${enumType}>;`;
  });
  const pgEnums = meta.pgEnums.map(({ fieldName, enumType }) => {
    return code`${fieldName}?: ${EnumGraphQLFilter}<${enumType}>;`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${
      otherEntity.type
    }>, ${nullOrNever(notNull)}>;`;
  });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const polys = meta.polymorphics.map(({ fieldName, fieldType }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${fieldType}, ${IdOf}<${fieldType}>, never, null | undefined>;`;
  });
  return [...primitives, ...enums, ...pgEnums, ...m2o, ...o2o, ...polys];
}

function generateOrderFields(meta: EntityDbMetadata): Code[] {
  // Make our opts type
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
  return [...primitives, ...enums, ...pgEnums, ...m2o];
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

function nullOrNever(notNull: boolean): string {
  return notNull ? "never" : " null | undefined";
}
