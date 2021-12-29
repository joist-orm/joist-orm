import { camelCase, pascalCase } from "change-case";
import { code, Code, imp } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata, PrimitiveField, PrimitiveTypescriptType } from "./EntityDbMetadata";
import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  ConfigApi,
  Entity,
  EntityConstructor,
  EntityFilter,
  EntityGraphQLFilter,
  EntityManager,
  EnumGraphQLFilter,
  FilterOf,
  Flavor,
  getEm,
  GraphQLFilterOf,
  IdOf,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  OrmApi,
  PartialOrNull,
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
  const { entity } = meta;
  const entityName = entity.name;

  // Add the primitives
  const primitives = meta.primitives.map((p) => {
    const { fieldName, fieldType, notNull } = p;
    const maybeOptional = notNull ? "" : " | undefined";

    let getter: Code;
    if (p.derived === "async") {
      getter = code`
        get ${fieldName}(): ${fieldType}${maybeOptional} {
          if (!("${fieldName}" in this.__orm.data)) {
            throw new Error("${fieldName} has not been derived yet");
          }
          return this.__orm.data["${fieldName}"];
        }
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

  // Add ManyToOne entities
  const m2o = meta.manyToOnes.map((m2o) => {
    const { fieldName, otherEntity, otherFieldName, notNull } = m2o;
    const maybeOptional = notNull ? "true" : "false";
    return code`
      readonly ${fieldName} = this.orm.hasOne(
        ${otherEntity.metaType},
        "${fieldName}",
        "${otherFieldName}",
        ${maybeOptional},
      );
    `;
  });

  // Add OneToMany
  const o2m = meta.oneToManys.map((o2m) => {
    const { fieldName, otherFieldName, otherColumnName, otherEntity } = o2m;
    return code`
      readonly ${fieldName} = this.orm.hasMany(
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
      readonly ${fieldName} = this.orm.hasOneToOne(
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
      readonly ${fieldName} = this.orm.hasManyToMany(
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
    const maybeOptional = notNull ? "true" : "false";
    return code`
      readonly ${fieldName} = this.orm.hasOnePolymorphic("${fieldName}", ${maybeOptional});
    `;
  });

  const configName = `${camelCase(entityName)}Config`;
  const metadata = imp(`${camelCase(entityName)}Meta@./entities`);

  const defaultValues = generateDefaultValues(config, meta);
  const hasDefaultValues = defaultValues.length > 0;
  const defaultValuesName = `${camelCase(entityName)}DefaultValues`;

  const contextType = config.contextType ? imp(config.contextType) : "{}";
  const factoryMethod = imp(`new${entity.name}@./entities`);

  return code`
    export type ${entityName}Id = ${Flavor}<string, "${entityName}">;

    ${generatePolymorphicTypes(meta)}
    
    export interface ${entityName}Opts {
      ${generateOptsFields(config, meta)}
    }
    
    export interface ${entityName}IdsOpts {
      ${generateOptIdsFields(config, meta)}
    }

    export interface ${entityName}Filter {
      id?: ${ValueFilter}<${entityName}Id, never>;
      ${generateFilterFields(meta)}
    }

    export interface ${entityName}GraphQLFilter {
      id?: ${ValueGraphQLFilter}<${entityName}Id>;
      ${generateGraphQLFilterFields(meta)}
    }

    export interface ${entityName}Order {
      id?: ${OrderBy};
      ${generateOrderFields(meta)}
    }
    
    ${hasDefaultValues ? code`export const ${defaultValuesName} = { ${defaultValues} };` : ""}

    export const ${configName} = new ${ConfigApi}<${entity.type}, ${contextType}>();

    ${generateDefaultValidationRules(meta, configName)}
  
    export abstract class ${entityName}Codegen extends ${BaseEntity} {
      readonly __types: {
        filterType: ${entityName}Filter;
        gqlFilterType: ${entityName}GraphQLFilter;
        orderType: ${entityName}Order;
        optsType: ${entityName}Opts;
        optIdsType: ${entityName}IdsOpts;
        factoryOptsType: Parameters<typeof ${factoryMethod}>[1];
      } = null!;
      protected readonly orm = new ${OrmApi}(this as any as ${entityName});

      ${[o2m, m2o, o2o, m2m, polymorphic]}

      constructor(em: ${EntityManager}, opts: ${entityName}Opts) {
        super(em, ${metadata}, ${hasDefaultValues ? `${defaultValuesName}` : "{}"}, opts);
        ${setOpts}(this as any as ${entityName}, opts, { calledFromConstructor: true });
      }

      get id(): ${entityName}Id | undefined {
        return this.__orm.data["id"];
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

      async load<U, V>(fn: (lens: ${Lens}<${entity.type}>) => ${Lens}<U, V>): Promise<V> {
        return ${loadLens}(this as any as ${entityName}, fn);
      }

      async populate<H extends ${LoadHint}<${entityName}>>(hint: H): Promise<${Loaded}<${entityName}, H>> {
        return ${getEm}(this).populate(this as any as ${entityName}, hint);
      }
    }
  `;
}

function fieldHasDefaultValue(config: Config, meta: EntityDbMetadata, field: PrimitiveField): boolean {
  let { fieldType, columnDefault, derived } = field;

  // if there's no default at all, return false
  if (columnDefault === null) {
    return false;
  }

  // even though default is defined as a number | boolean | string | null in reality pg-structure
  // only ever returns a string | null so we make sure of that here
  columnDefault = columnDefault.toString();

  // if this value should be set elsewhere, return false
  if (derived !== false) {
    return false;
  }

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
    .filter((field) => fieldHasDefaultValue(config, meta, field))
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
  return [...primitives, ...enums];
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
    return code`${fieldName}${maybeOptional(
      notNull && !fieldHasDefaultValue(config, meta, field),
    )}: ${fieldType}${maybeUnionNull(notNull)};`;
  });
  const enums = meta.enums.map(({ fieldName, enumType, notNull, isArray }) => {
    if (isArray) {
      // Arrays are always optional and we'll default to `[]`
      return code`${fieldName}?: ${enumType}[];`;
    } else {
      return code`${fieldName}${maybeOptional(notNull)}: ${enumType}${maybeUnionNull(notNull)};`;
    }
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}${maybeOptional(notNull)}: ${otherEntity.type}${maybeUnionNull(notNull)};`;
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
  return [...primitives, ...enums, ...m2o, ...polys, ...o2o, ...o2m, ...m2m];
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
  return [...primitives, ...enums, ...m2o, ...o2o, ...polys];
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
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>>;`;
  });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>>;`;
  });
  const polys = meta.polymorphics.map(({ fieldName, fieldType }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${fieldType}, ${IdOf}<${fieldType}>, never>;`;
  });
  return [...primitives, ...enums, ...m2o, ...o2o, ...polys];
}

function generateOrderFields(meta: EntityDbMetadata): Code[] {
  // Make our opts type
  const primitives = meta.primitives.map(({ fieldName }) => {
    return code`${fieldName}?: ${OrderBy};`;
  });
  const enums = meta.enums.map(({ fieldName }) => {
    return code`${fieldName}?: ${OrderBy};`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.orderType};`;
  });
  return [...primitives, ...enums, ...m2o];
}

function maybeOptional(notNull: boolean): string {
  return notNull ? "" : "?";
}

function maybeUnionNull(notNull: boolean): string {
  return notNull ? "" : " | null";
}

function nullOrNever(notNull: boolean): string {
  return notNull ? "never" : " null | undefined";
}
