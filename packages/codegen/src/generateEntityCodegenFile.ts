import { camelCase, pascalCase } from "change-case";
import { code, Code, imp } from "ts-poet";
import { SymbolSpec } from "ts-poet/build/SymbolSpecs";
import { Entity, EntityDbMetadata, PrimitiveField } from "./EntityDbMetadata";
import { Config } from "./index";
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
  Lens,
  Loaded,
  LoadHint,
  loadLens,
  ManyToManyCollection,
  ManyToOneReference,
  newChangesProxy,
  newRequiredRule,
  OneToManyCollection,
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
    if (isAsyncDerived(config, entity, fieldName)) {
      getter = code`
        get ${fieldName}(): ${fieldType}${maybeOptional} {
          if (!("${fieldName}" in this.__orm.data)) {
            throw new Error("${fieldName} has not been derived yet");
          }
          return this.__orm.data["${fieldName}"];
        }
     `;
    } else if (isDerived(config, entity, fieldName)) {
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
    if (isProtected(config, entity, fieldName)) {
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
    } else if (
      ormMaintainedFields.includes(fieldName) ||
      isDerived(config, entity, fieldName) ||
      isAsyncDerived(config, entity, fieldName)
    ) {
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

  // Add ManyToOne
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

  // Add ManyToOne
  const m2o = meta.manyToOnes.map((m2o) => {
    const { fieldName, otherEntity, otherFieldName, notNull } = m2o;
    const maybeOptional = notNull ? "never" : "undefined";
    return code`
      readonly ${fieldName}: ${Reference}<${entity.type}, ${otherEntity.type}, ${maybeOptional}> =
        new ${ManyToOneReference}<${entity.type}, ${otherEntity.type}, ${maybeOptional}>(
          this as any,
          ${otherEntity.type},
          "${fieldName}",
          "${otherFieldName}",
          ${notNull},
        );
    `;
  });

  // Add OneToMany
  const o2m = meta.oneToManys.map((o2m) => {
    const { fieldName, otherFieldName, otherColumnName, otherEntity } = o2m;
    return code`
      readonly ${fieldName}: ${Collection}<${entity.type}, ${otherEntity.type}> = new ${OneToManyCollection}(
        this as any,
        ${otherEntity.metaType},
        "${fieldName}",
        "${otherFieldName}",
        "${otherColumnName}"
      );
    `;
  });

  // Add ManyToMany
  const m2m = meta.manyToManys.map((m2m) => {
    const { joinTableName, fieldName, columnName, otherEntity, otherFieldName, otherColumnName } = m2m;
    return code`
      readonly ${fieldName}: ${Collection}<${entity.type}, ${otherEntity.type}> = new ${ManyToManyCollection}(
        "${joinTableName}",
        this,
        "${fieldName}",
        "${columnName}",
        ${otherEntity.type},
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

  return code`
    export type ${entityName}Id = ${Flavor}<string, "${entityName}">;

    export interface ${entityName}Opts {
      ${generateOptsFields(config, meta)}
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
      readonly __filterType: ${entityName}Filter = null!;
      readonly __gqlFilterType: ${entityName}GraphQLFilter = null!;
      readonly __orderType: ${entityName}Order = null!;
      readonly __optsType: ${entityName}Opts = null!;
      ${[o2m, m2o, m2m]}

      constructor(em: ${EntityManager}, opts: ${entityName}Opts) {
        ${hasDefaultValues ? code`super(em, ${metadata}, {...${defaultValuesName}})` : code`super(em, ${metadata})`};
        this.set(opts as ${entityName}Opts, { calledFromConstructor: true } as any);
      }

      get id(): ${entityName}Id | undefined {
        return this.__orm.data["id"];
      }

      ${primitives}
      
      set(values: Partial<${entityName}Opts>, opts: { ignoreUndefined?: boolean } = {}): void {
        ${setOpts}(this, values as ${OptsOf}<this>, opts);
      }

      setUnsafe(values: ${PartialOrNull}<${entityName}Opts>, opts: { ignoreUndefined?: boolean } = {}): void {
        ${setOpts}(this, values as ${OptsOf}<this>, { ignoreUndefined: true, ...opts });
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
  if (
    ormMaintainedFields.includes(fieldName) ||
    isDerived(config, meta.entity, fieldName) ||
    isAsyncDerived(config, meta.entity, fieldName)
  ) {
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

function generateOptsFields(config: Config, meta: EntityDbMetadata): Code[] {
  // Make our opts type
  const primitives = meta.primitives.map((field) => {
    const { fieldName, fieldType, notNull, columnDefault } = field;
    if (
      ormMaintainedFields.includes(fieldName) ||
      isDerived(config, meta.entity, fieldName) ||
      isAsyncDerived(config, meta.entity, fieldName)
    ) {
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
  const o2m = meta.oneToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.type}[];`;
  });
  const m2m = meta.manyToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.type}[];`;
  });
  return [...primitives, ...enums, ...m2o, ...o2m, ...m2m];
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

const ormMaintainedFields = ["createdAt", "updatedAt"];

export function isDerived(config: Config, entity: Entity, fieldName: string): boolean {
  return config.derivedFields.includes(`${entity.name}.${fieldName}`);
}

export function isAsyncDerived(config: Config, entity: Entity, fieldName: string): boolean {
  return config.asyncDerivedFields.includes(`${entity.name}.${fieldName}`);
}

export function isProtected(config: Config, entity: Entity, fieldName: string): boolean {
  return config.protectedFields.includes(`${entity.name}.${fieldName}`);
}
