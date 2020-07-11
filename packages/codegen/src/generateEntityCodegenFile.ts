import { camelCase, pascalCase } from "change-case";
import { code, Code, imp } from "ts-poet";
import { SymbolSpec } from "ts-poet/build/SymbolSpecs";
import { Config } from "./config";
import { EntityDbMetadata, PrimitiveField } from "./EntityDbMetadata";
import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  Collection,
  ConfigApi,
  EntityFilter,
  EntityGraphQLFilter,
  EntityManager,
  EnumGraphQLFilter,
  FilterOf,
  Flavor,
  getEm,
  GraphQLFilterOf,
  hasMany,
  hasManyToMany,
  hasOne,
  hasOneToOne,
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  newChangesProxy,
  newRequiredRule,
  OptsOf,
  OrderBy,
  PartialOrNull,
  Reference,
  setField,
  setOpts,
  ValueFilter,
  ValueGraphQLFilter,
} from "./symbols";

export interface ColumnMetaData {
  typeConverter?: SymbolSpec;
  fieldType: SymbolSpec | string;
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
  meta.enums.forEach((e) => {
    const { fieldName, enumType, notNull } = e;
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
    // Group enums as primitives
    primitives.push(getter);
    primitives.push(setter);
  });

  // Add ManyToOne entities
  const m2o = meta.manyToOnes.map((m2o) => {
    const { fieldName, otherEntity, otherFieldName, notNull } = m2o;
    const maybeOptional = notNull ? "never" : "undefined";
    return code`
      readonly ${fieldName}: ${Reference}<${entity.type}, ${otherEntity.type}, ${maybeOptional}> =
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

  // Add OneToOne
  const o2o = meta.oneToOnes.map((o2o) => {
    const { fieldName, otherEntity, otherFieldName } = o2o;
    return code`
      readonly ${fieldName}: ${Reference}<${entity.type}, ${otherEntity.type}, undefined> =
        ${hasOneToOne}(
          ${otherEntity.metaType},
          "${fieldName}",
          "${otherFieldName}",
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

  const configName = `${camelCase(entityName)}Config`;
  const metadata = imp(`${camelCase(entityName)}Meta@./entities`);

  const defaultValues = generateDefaultValues(config, meta);
  const hasDefaultValues = defaultValues.length > 0;
  const defaultValuesName = `${camelCase(entityName)}DefaultValues`;

  const factoryMethod = imp(`new${entity.name}@./entities`);

  return code`
    export type ${entityName}Id = ${Flavor}<string, "${entityName}">;

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

    export const ${configName} = new ${ConfigApi}<${entity.type}>();

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
      ${[o2m, m2o, o2o, m2m]}

      constructor(em: ${EntityManager}, opts: ${entityName}Opts) {
        ${hasDefaultValues ? code`super(em, ${metadata}, {...${defaultValuesName}})` : code`super(em, ${metadata})`};
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
  let { fieldName, columnDefault, columnType } = field;

  // if there's no default at all, return false
  if (columnDefault === null) {
    return false;
  }

  // even though default is defined as a number | boolean | string | null in reality pg-structure
  // only ever returns a string | null so we make sure of that here
  columnDefault = columnDefault.toString();

  // if this value should be set elsewhere, return false
  if (field.derived !== false) {
    return false;
  }

  // try to validate that we actually got a primitive value and not arbitrary SQL
  return (
    (["smallint", "int", "bigint"].includes(columnType) && !isNaN(parseInt(columnDefault))) ||
    (["varchar", "text"].includes(columnType) && /^'.*'$/.test(columnDefault)) ||
    ("bool" === columnType && ["true", "false"].includes(columnDefault))
  );
}

function generateDefaultValues(config: Config, meta: EntityDbMetadata): Code[] {
  return meta.primitives
    .filter((field) => fieldHasDefaultValue(config, meta, field))
    .map(({ fieldName, columnDefault }) => {
      return code`${fieldName}: ${columnDefault},`;
    });
}

function generateDefaultValidationRules(meta: EntityDbMetadata, configName: string): Code[] {
  const fields = [...meta.primitives, ...meta.enums, ...meta.manyToOnes];
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
  const enums = meta.enums.map(({ fieldName, enumType, notNull }) => {
    return code`${fieldName}${maybeOptional(notNull)}: ${enumType}${maybeUnionNull(notNull)};`;
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
  return [...primitives, ...enums, ...m2o, ...o2o, ...o2m, ...m2m];
}

// We know the OptIds types are only used in partials, so we make everything optional.
// This especially needs to be the case b/c both `book: ...` and `bookId: ...` will be
// in the partial type and of course the caller will only be setting one.
function generateOptIdsFields(config: Config, meta: EntityDbMetadata): Code[] {
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
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
  return [...m2o, ...o2o, ...o2m, ...m2m];
}

function generateFilterFields(meta: EntityDbMetadata): Code[] {
  const primitives = meta.primitives.map(({ fieldName, fieldType, notNull }) => {
    if (fieldType === "boolean") {
      return code`${fieldName}?: ${BooleanFilter}<${nullOrNever(notNull)}>;`;
    } else {
      return code`${fieldName}?: ${ValueFilter}<${fieldType}, ${nullOrNever(notNull)}>;`;
    }
  });
  const enums = meta.enums.map(({ fieldName, enumType, notNull }) => {
    return code`${fieldName}?: ${ValueFilter}<${enumType}, ${nullOrNever(notNull)}>;`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${
      otherEntity.type
    }>, ${nullOrNever(notNull)}>;`;
  });
  return [...primitives, ...enums, ...m2o];
}

function generateGraphQLFilterFields(meta: EntityDbMetadata): Code[] {
  const primitives = meta.primitives.map(({ fieldName, fieldType, notNull }) => {
    if (fieldType === "boolean") {
      return code`${fieldName}?: ${BooleanGraphQLFilter};`;
    } else {
      return code`${fieldName}?: ${ValueGraphQLFilter}<${fieldType}>;`;
    }
  });
  const enums = meta.enums.map(({ fieldName, enumType, notNull }) => {
    return code`${fieldName}?: ${EnumGraphQLFilter}<${enumType}>;`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>>;`;
  });
  return [...primitives, ...enums, ...m2o];
}

function generateOrderFields(meta: EntityDbMetadata): Code[] {
  // Make our opts type
  const primitives = meta.primitives.map(({ fieldName }) => {
    return code`${fieldName}?: ${OrderBy};`;
  });
  const enums = meta.enums.map(({ fieldName }) => {
    return code`${fieldName}?: ${OrderBy};`;
  });
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull }) => {
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
