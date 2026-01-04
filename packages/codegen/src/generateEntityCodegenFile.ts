import { camelCase, pascalCase } from "change-case";
import { plural } from "pluralize";
import { Code, code, imp, joinCode } from "ts-poet";
import {
  DbMetadata,
  Entity,
  EntityDbMetadata,
  EnumField,
  ManyToOneField,
  PgEnumField,
  PolymorphicField,
  PrimitiveField,
  PrimitiveTypescriptType,
} from "./EntityDbMetadata";
import { Config } from "./config";
import { getStiEntities } from "./inheritance";
import { keywords } from "./keywords";
import {
  BaseEntity,
  BooleanFilter,
  BooleanGraphQLFilter,
  Changes,
  Collection,
  ConfigApi,
  DeepPartialOrNull,
  EntityFilter,
  EntityGraphQLFilter,
  EntityManager,
  EntityMetadata,
  FieldsOf,
  FilterOf,
  Flavor,
  GraphQLFilterOf,
  IdOf,
  JsonPayload,
  LargeCollection,
  Lens,
  LoadHint,
  Loaded,
  ManyToOneReference,
  MaybeAbstractEntityConstructor,
  OneToOneReference,
  OptsOf,
  OrderBy,
  PartialOrNull,
  PolymorphicReference,
  ProjectEntity,
  ReactiveField,
  ReactiveManyToMany,
  ReactiveManyToManyOtherSide,
  ReactiveReference,
  ReadOnlyCollection,
  RelationsOf,
  SSAssert,
  TaggedId,
  ToJsonHint,
  ValueFilter,
  ValueGraphQLFilter,
  Zod,
  cannotBeUpdated,
  failNoIdYet,
  getField,
  hasLargeMany,
  hasLargeManyToMany,
  hasMany,
  hasManyToMany,
  hasOne,
  hasOnePolymorphic,
  hasOneToOne,
  hasReactiveManyToManyOtherSide,
  hasRecursiveChildren,
  hasRecursiveParents,
  isEntity,
  isLoaded,
  loadLens,
  mustBeSubType,
  newChangesProxy,
  newRequiredRule,
  setField,
  setOpts,
  toIdOf,
  toJSON,
  updatePartial,
} from "./symbols";
import { tsdocComments } from "./tsdoc";
import { assertNever, fail, uncapitalize } from "./utils";

export interface ColumnMetaData {
  fieldType: PrimitiveTypescriptType;
}

// A local type just for tracking abstract vs. concrete relations
type Relation =
  // I.e. `abstract ReactiveReference` that the user must implement
  | { kind: "abstract"; line: Code }
  // I.e. a `get author(): ManyToOne<...>`
  | { kind: "concrete"; fieldName: string; decl: Code; init: Code }
  // I.e. a `get author(): { super.author as ... }`
  | { kind: "super"; fieldName: string; decl: Code };

/** Creates the base class with the boilerplate annotations. */
export function generateEntityCodegenFile(config: Config, dbMeta: DbMetadata, meta: EntityDbMetadata): Code {
  const { entitiesByName: metasByName } = dbMeta;
  const { entity, tagName } = meta;
  const entityName = entity.name;

  // Avoid using `do` as a variable name b/c it's a reserved keyword
  const varName = keywords.includes(tagName) ? uncapitalize(entityName) : tagName;

  const primitives = createPrimitives(meta, entity); // Add the primitives
  primitives.push(...createRegularEnums(meta, entity)); // Add ManyToOne enums
  primitives.push(...createArrayEnums(meta)); // Add integer[] enums
  primitives.push(...createPgEnums(meta)); // Add native enums
  const relations = createRelations(config, meta, entity);

  const configName = `${camelCase(entityName)}Config`;
  const metadata = imp(`${camelCase(entityName)}Meta@./entities.ts`);

  const contextType = config.contextType ? imp(`t:${config.contextType}`) : "{}";
  const factoryMethod = imp(`new${entity.name}@./entities.ts`);

  // If we're not tagged-strings, detag on the way out of id
  const idMaybeCode =
    config.idType === "tagged-string"
      ? code`return this.idTaggedMaybe;`
      : code`return ${toIdOf}(${metadata}, this.idTaggedMaybe);`;
  const idType = getIdType(config);

  const maybeIsSoftDeleted = meta.deletedAt
    ? code`
    get isSoftDeletedEntity(): boolean {
      return this.${meta.deletedAt.fieldName} !== undefined;
    }
  `
    : "";

  // Set up the codegen artifacts to extend from the base type if necessary
  const baseEntity = dbMeta.entities.find((e) => e.name === meta.baseClassName);
  const subEntities = dbMeta.entities.filter((e) => e.baseClassName === meta.name);
  const base = baseEntity?.entity.typeSymbol ?? code`${BaseEntity}<${EntityManager}, ${idType}>`;
  const maybeBaseFields = baseEntity ? code`extends ${imp("t:" + baseEntity.name + "Fields@./entities.ts")}` : "";
  const maybeBaseOpts = baseEntity ? code`extends ${baseEntity.entity.optsType}` : "";
  const maybeBaseIdOpts = baseEntity ? code`extends ${imp("t:" + baseEntity.name + "IdsOpts@./entities.ts")}` : "";
  const maybeBaseFilter = baseEntity ? code`extends ${imp("t:" + baseEntity.name + "Filter@./entities.ts")}` : "";
  const maybeBaseGqlFilter = baseEntity
    ? code`extends ${imp("t:" + baseEntity.name + "GraphQLFilter@./entities.ts")}`
    : "";
  const maybeBaseOrder = baseEntity ? code`extends ${baseEntity.entity.orderType}` : "";
  const maybePreventBaseTypeInstantiation = meta.abstract
    ? code`
    if (this.constructor === ${entity.type} && !(em as any).fakeInstance) {
      throw new Error(\`${entity.type} must be instantiated via a subtype\`);
    }`
    : "";

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
      [
        code`, `,
        ...[meta, ...subEntities].map(
          (e) => code`keyof (${FieldsOf}<${e.entity.type}> & ${RelationsOf}<${e.entity.type}>)`,
        ),
      ],
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
    export type ${entityName}Id = ${Flavor}<${idType}, "${baseEntity ? baseEntity.name : entityName}">;

    ${generatePolymorphicTypes(meta)}
    
    export interface ${entityName}Fields ${maybeBaseFields} {
      ${generateFieldsType(meta, idType)}
    }

    export interface ${entityName}Opts ${maybeBaseOpts} {
      ${generateOptsFields(meta)}
    }

    export interface ${entityName}IdsOpts ${maybeBaseIdOpts} {
      ${generateOptIdsFields(meta)}
    }

    export interface ${entityName}Filter ${maybeBaseFilter} {
      ${generateFilterFields(metasByName, meta)}
    }

    export interface ${entityName}GraphQLFilter ${maybeBaseGqlFilter} {
      ${generateGraphQLFilterFields(metasByName, meta)}
    }

    export interface ${entityName}Order ${maybeBaseOrder} {
      ${generateOrderFields(meta)}
    }
    
    export interface ${entityName}FactoryExtras {
      ${generateFactoryExtrasType(meta)}
    }

    export const ${configName} = new ${ConfigApi}<${entity.type}, ${contextType}>();

    ${generateDefaultValidationRules(dbMeta, meta, configName)}
    ${generateDefaultValues(config, meta, configName)};

    declare module "joist-orm" {
      interface TypeMap {
        ${entityName}: {
          entityType: ${entityName};
          filterType: ${entityName}Filter;
          gqlFilterType: ${entityName}GraphQLFilter;
          orderType: ${entityName}Order;
          optsType: ${entityName}Opts;
          fieldsType: ${entityName}Fields;
          optIdsType: ${entityName}IdsOpts;
          factoryExtrasType: ${entityName}FactoryExtras;
          factoryOptsType: Parameters<typeof ${factoryMethod}>[1];
        };
      }
    }

    export abstract class ${entityName}Codegen extends ${base} implements ${ProjectEntity} {
      static readonly tagName = "${tagName}";
      static readonly metadata: ${EntityMetadata}<${entity.type}>;

      declare readonly __type: {
        ${baseEntity ? `0: "${baseEntity.name}",` : ""}
        ${baseEntity ? 1 : 0}: "${entityName}", 
      };

      ${relations.filter((r) => r.kind === "abstract").map((r) => r.line)}
      ${relations
        .filter((r) => r.kind === "concrete")
        .map((r) => {
          return code`readonly ${r.fieldName}: ${r.decl} = ${r.init};`;
        })}
      ${relations
        .filter((r) => r.kind === "super")
        .map((r) => {
          return code`declare readonly ${r.fieldName}: ${r.decl};`;
        })}

      get id(): ${entityName}Id {
        return this.idMaybe || ${failNoIdYet}("${entityName}");
      }

      get idMaybe(): ${entityName}Id | undefined {
        ${idMaybeCode}
      }

      get idTagged(): ${TaggedId} {
        return this.idTaggedMaybe || ${failNoIdYet}("${entityName}");
      }

      get idTaggedMaybe(): ${TaggedId} | undefined {
        return ${getField}(this, "id");
      }

      ${primitives}    

      ${tsdocComments.entity.setPartial}
      set(opts: Partial<${entityName}Opts>): void {
        ${setOpts}(this as any as ${entityName}, opts);
      }
      
      ${tsdocComments.entity.setPartial}
      setPartial(opts: ${PartialOrNull}<${entityName}Opts>): void {
        ${setOpts}(this as any as ${entityName}, opts as ${OptsOf}<${entityName}>, { partial: true });
      }

      ${tsdocComments.entity.setDeepPartial}
      setDeepPartial(opts: ${DeepPartialOrNull}<${entityName}>): Promise<void> {
        return ${updatePartial}(this as any as ${entityName}, opts);
      }

      ${tsdocComments.entity.changes}
      get changes(): ${Changes}<${entityName}${maybeOtherTypeChanges}> {
        return ${newChangesProxy}(this) as any;
      }

      ${maybeIsSoftDeleted}

      ${tsdocComments.entity.load}
      load<U, V>(fn: (lens: ${Lens}<${entity.type}>) => ${Lens}<U, V>, opts: { sql?: boolean } = {}): Promise<V> {
        return ${loadLens}(this as any as ${entityName}, fn, opts);
      }

      ${tsdocComments.entity.populate}
      populate<const H extends ${LoadHint}<${entityName}>>(hint: H): Promise<${Loaded}<${entityName}, H>>;
      populate<const H extends ${LoadHint}<${entityName}>>(opts: { hint: H, forceReload?: boolean }): Promise<${Loaded}<${entityName}, H>>;
      populate<const H extends ${LoadHint}<${entityName}>, V>(hint: H, fn: (${varName}: Loaded<${entityName}, H>) => V): Promise<V>;
      populate<const H extends ${LoadHint}<${entityName}>, V>(opts: { hint: H, forceReload?: boolean }, fn: (${varName}: Loaded<${entityName}, H>) => V): Promise<V>;
      populate<const H extends ${LoadHint}<${entityName}>, V>(hintOrOpts: any, fn?: (${varName}: Loaded<${entityName}, H>) => V): Promise<${Loaded}<${entityName}, H> | V> {
        return this.em.populate(this as any as ${entityName}, hintOrOpts, fn);
      }

      ${tsdocComments.entity.isLoaded}
      isLoaded<const H extends ${LoadHint}<${entityName}>>(hint: H): this is ${Loaded}<${entityName}${maybeOtherLoaded}, H> {
        return ${isLoaded}(this as any as ${entityName}, hint);
      }

      ${tsdocComments.entity.toJSON}
      toJSON(): object;
      toJSON<const H extends ${ToJsonHint}<${entityName}>>(hint: H): Promise<${JsonPayload}<${entityName}, H>>;
      toJSON(hint?: any): object {
        return !hint || typeof hint === "string" ? super.toJSON() : ${toJSON}(this, hint);
      }
    }
  `;
}

function fieldHasDefaultValue(field: PrimitiveField | EnumField | PgEnumField): boolean {
  let { columnDefault } = field;
  // If there's no default at all, return false
  if (columnDefault === null) {
    return false;
  }
  // Even though default is defined as a `number | boolean | string | null`, in reality pg-structure
  // only ever returns a `string | null`, so we handle that here
  columnDefault = columnDefault.toString();
  const fieldType = field.kind === "primitive" ? field.fieldType : "number";
  // Try to validate that we actually got a primitive value and not arbitrary SQL
  return (
    (fieldType === "number" && !isNaN(parseInt(columnDefault))) ||
    (fieldType === "bigint" && !isNaN(parseInt(columnDefault))) ||
    (fieldType === "string" && /^'.*'$/.test(columnDefault)) ||
    (fieldType === "boolean" && ["true", "false"].includes(columnDefault))
  );
}

function generatePolymorphicTypes(meta: EntityDbMetadata) {
  return meta.polymorphics.flatMap((pf) => [
    code`export type ${pf.fieldType} = ${pf.components.map((c) => code`| ${c.otherEntity.type}`)};`,
    code`export function get${pf.fieldType}Constructors(): ${MaybeAbstractEntityConstructor}<${pf.fieldType}>[] {
      return [${pf.components.map((c) => code`${c.otherEntity.typeSymbol},`)}];
    }`,
    code`export function is${pf.fieldType}(maybeEntity: unknown): maybeEntity is ${pf.fieldType} {
      return ${isEntity}(maybeEntity) && get${pf.fieldType}Constructors().some((type) => maybeEntity instanceof type);
    }`,
  ]);
}

function generateDefaultValues(config: Config, meta: EntityDbMetadata, configName: string): Code[] {
  // Skip sync defaults b/c we'll just stomp the getter; leave async in case they're RQFs
  // where the row must fundamentally be inserted with a dummy value before the real value is calced.
  function notSync(field: PrimitiveField | EnumField): boolean {
    return "derived" in field && field.derived !== "sync";
  }

  const primitives = meta.primitives
    .filter((field) => fieldHasDefaultValue(field))
    .filter(notSync)
    .map(({ fieldName, columnDefault }) => {
      return code`${configName}.setDefault("${fieldName}", ${columnDefault});`;
    });
  const pgEnums = meta.pgEnums
    .filter((field) => !!field.columnDefault)
    .map(({ fieldName, columnDefault }) => {
      return code`${configName}.setDefault("${fieldName}", ${columnDefault});`;
    });
  const enums = meta.enums
    .filter((field) => !!field.columnDefault && !field.isArray)
    .filter(notSync)
    .map(({ fieldName, columnDefault, enumRows, enumType, columnName }) => {
      const defaultRow =
        enumRows.find((r) => r.id === Number(columnDefault)) ||
        fail(`Invalid default value ${columnDefault} for ${meta.tableName}.${columnName}`);
      return code`${configName}.setDefault("${fieldName}", ${enumType}.${pascalCase(defaultRow.code)});`;
    });
  return [...primitives, ...enums, ...pgEnums];
}

function generateDefaultValidationRules(db: DbMetadata, meta: EntityDbMetadata, configName: string): Code[] {
  // Add required rules for all not-null columns
  const fields = [...meta.primitives, ...meta.enums, ...meta.manyToOnes, ...meta.polymorphics];
  const rules = fields
    .filter((p) => p.notNull)
    .map((p) => {
      const { fieldName } = p;
      const isReactive = "derived" in p && p.derived === "async";
      if (isReactive) {
        return code`${configName}.addRule("${fieldName}", ${newRequiredRule}("${fieldName}"));`;
      } else {
        return code`${configName}.addRule(${newRequiredRule}("${fieldName}"));`;
      }
    });
  // Add STI discriminator cannot change
  if (meta.stiDiscriminatorField) {
    const field = meta.enums.find((e) => e.fieldName === meta.stiDiscriminatorField) ?? fail("STI field not found");
    rules.push(code`${configName}.addRule(${cannotBeUpdated}("${field.fieldName}"));`);
  }
  // Add STI type must match
  const stiEntities = getStiEntities(db.entities);
  if (stiEntities.size > 0) {
    for (const m2o of meta.manyToOnes) {
      // The `m2o.otherEntity` may already be pointing at the subtype, but stiEntities has subtypes in it as well...
      const target = stiEntities.get(m2o.otherEntity.name);
      if (target && m2o.otherEntity.name !== target.base.name) {
        rules.push(code`${configName}.addRule("${m2o.fieldName}", ${mustBeSubType}("${m2o.fieldName}"));`);
      }
    }
  }
  // Add subtype specialization must match
  if (meta.baseType) {
    meta.manyToOnes
      .filter((m2o) =>
        meta.baseType?.manyToOnes?.find(
          (o) => o.fieldName === m2o.fieldName && o.otherEntity.name !== m2o.otherEntity.name,
        ),
      )
      .forEach((m2o) => {
        rules.push(code`${configName}.addRule("${m2o.fieldName}", ${mustBeSubType}("${m2o.fieldName}"));`);
      });
  }
  return rules;
}

// Make our opts type
function generateOptsFields(meta: EntityDbMetadata): Code[] {
  const primitives = meta.primitives.map((field) => {
    const { fieldName, fieldType, notNull, derived } = field;
    if (derived) return code``;
    return code`${fieldName}${maybeOptionalOrDefault(field)}: ${fieldType}${maybeUnionNull(notNull)};`;
  });
  const enums = meta.enums.map((field) => {
    const { fieldName, enumType, notNull, isArray, derived } = field;
    if (meta.stiDiscriminatorField === fieldName || derived) {
      // Don't include the discriminator as an opt b/c we'll infer it from the instance type
      return code``;
    } else if (isArray) {
      // Arrays are always optional and we'll default to `[]`
      return code`${fieldName}?: ${enumType}[];`;
    } else {
      return code`${fieldName}${maybeOptionalOrDefault(field)}: ${enumType}${maybeUnionNull(notNull)};`;
    }
  });
  const pgEnums = meta.pgEnums.map((field) => {
    const { fieldName, enumType, notNull } = field;
    return code`${fieldName}${maybeOptionalOrDefault(field)}: ${enumType}${maybeUnionNull(notNull)};`;
  });
  const m2o = meta.manyToOnes
    .filter(({ derived }) => !derived) // Skip ReactiveReferences (derived m2o)
    // If a `group: { subType: SmallPublisherGroup }` is specializing this relation, that's
    // fine for most things, but not the `SmallPublisherOpts`, b/c it will break the contravariance
    // of `Publisher.setOpts` and `SmallPublisher.setOpts`
    .filter(({ fieldName }) => !meta.baseType?.manyToOnes.find((o) => o.fieldName === fieldName))
    .map((field) => {
      const { fieldName, otherEntity, notNull } = field;
      const maybeNull = maybeUnionNull(notNull);
      return code`${fieldName}${maybeOptionalOrDefault(field)}: ${otherEntity.type} | ${otherEntity.idType} ${maybeNull};`;
    });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.type} | null;`;
  });
  const o2m = meta.oneToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${otherEntity.type}[];`;
  });
  const m2m = meta.manyToManys
    .filter(({ derived }) => !derived) // Skip ReactiveManyToManys
    .map(({ fieldName, otherEntity }) => {
      return code`${fieldName}?: ${otherEntity.type}[];`;
    });
  const polys = meta.polymorphics.map((field) => {
    const { fieldName, notNull, fieldType } = field;
    return code`${fieldName}${maybeOptionalOrDefault(field)}: ${fieldType};`;
  });
  return [...primitives, ...enums, ...pgEnums, ...m2o, ...polys, ...o2o, ...o2m, ...m2m];
}

// Make our fields type
function generateFieldsType(meta: EntityDbMetadata, idType: "string" | "number"): Code[] {
  const id = code`id: { kind: "primitive"; type: ${idType}; unique: ${true}; nullable: never };`;
  const primitives = meta.primitives.map((field) => {
    const { fieldName, fieldType, notNull, unique, derived } = field;
    return code`${fieldName}: { kind: "primitive"; type: ${fieldType}; unique: ${unique}; nullable: ${undefinedOrNever(
      notNull,
    )}, derived: ${derived !== false} };`;
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
  const m2o = meta.manyToOnes.map(({ fieldName, otherEntity, notNull, derived }) => {
    return code`${fieldName}: { kind: "m2o"; type: ${otherEntity.type}; nullable: ${undefinedOrNever(
      notNull,
    )}, derived: ${derived !== false} };`;
  });
  const polys = meta.polymorphics.map(({ fieldName, notNull, fieldType }) => {
    return code`${fieldName}: { kind: "poly"; type: ${fieldType}; nullable: ${undefinedOrNever(notNull)} };`;
  });
  const m2m = meta.manyToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}: { kind: "m2m"; type: ${otherEntity.type} };`;
  });
  const o2m = meta.oneToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}: { kind: "o2m"; type: ${otherEntity.type} };`;
  });
  const lo2m = meta.largeOneToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}: { kind: "o2m"; type: ${otherEntity.type} };`;
  });
  return [id, ...primitives, ...enums, ...pgEnums, ...m2o, ...polys, ...m2m, ...o2m, ...lo2m];
}

// We know the OptIds types are only used in partials, so we make everything optional.
// This especially needs to be the case b/c both `book: ...` and `bookId: ...` will be
// in the partial type and of course the caller will only be setting one.
function generateOptIdsFields(meta: EntityDbMetadata): Code[] {
  const m2o = meta.manyToOnes
    .filter(({ derived }) => !derived) // Skip ReactiveReferences
    .map(({ fieldName, otherEntity }) => {
      return code`${fieldName}Id?: ${otherEntity.idType} | null;`;
    });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}Id?: ${otherEntity.idType} | null;`;
  });
  const o2m = meta.oneToManys.map(({ singularName, otherEntity }) => {
    return code`${singularName}Ids?: ${otherEntity.idType}[] | null;`;
  });
  const m2m = meta.manyToManys
    .filter(({ derived }) => !derived) // Skip ReactiveManyToManys
    .map(({ singularName, otherEntity }) => {
      return code`${singularName}Ids?: ${otherEntity.idType}[] | null;`;
    });
  const polys = meta.polymorphics.map(({ fieldName, fieldType }) => {
    return code`${fieldName}Id?:  ${IdOf}<${fieldType}> | null;`;
  });
  return [...m2o, ...polys, ...o2o, ...o2m, ...m2m];
}

function generateFilterFields(metasByName: Record<string, EntityDbMetadata>, meta: EntityDbMetadata): Code[] {
  // Always allow filtering on null to do "child.id is null" for detecting "has no children"
  const maybeId = meta.baseClassName ? [] : [code`id?: ${ValueFilter}<${meta.entity.name}Id, never> | null;`];
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
  const m2o = meta.manyToOnes.flatMap(({ fieldName, otherEntity, notNull }) => {
    const otherMeta = metasByName[otherEntity.name] ?? fail(`Could not find metadata for ${otherEntity.name}`);
    return [
      code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${
        otherEntity.type
      }>, ${nullOrNever(notNull)}>;`,
      ...otherMeta.subTypes.map((st) => {
        return code`${fieldName}${st.name}?: ${EntityFilter}<${st.entity.type}, ${st.entity.idType}, ${FilterOf}<${
          st.entity.type
        }>, ${nullOrNever(notNull)}>;`;
      }),
    ];
  });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const o2m = meta.oneToManys.flatMap(({ fieldName, otherEntity, otherColumnNotNull }) => {
    const otherMeta = metasByName[otherEntity.name] ?? fail(`Could not find metadata for ${otherEntity.name}`);
    return [
      code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${otherEntity.type}>, null | undefined>;`,
      ...otherMeta.subTypes.map((st) => {
        return code`${fieldName}${st.name}?: ${EntityFilter}<${st.entity.type}, ${st.entity.idType}, ${FilterOf}<${
          st.entity.type
        }>, ${nullOrNever(otherColumnNotNull)}>;`;
      }),
    ];
  });
  const m2m = meta.manyToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityFilter}<${otherEntity.type}, ${otherEntity.idType}, ${FilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const polys = meta.polymorphics.flatMap(({ fieldName, fieldType, components, notNull }) => {
    return [
      code`${fieldName}?: ${EntityFilter}<${fieldType}, ${IdOf}<${fieldType}>, never, ${nullOrNever(notNull)}>;`,
      ...components.map((comp) => {
        const { type } = comp.otherEntity;
        return code`${fieldName}${type}?: ${EntityFilter}<${type}, ${IdOf}<${type}>, ${FilterOf}<${type}>, null>;`;
      }),
    ];
  });
  return [...maybeId, ...primitives, ...enums, ...pgEnums, ...m2o, ...o2o, ...o2m, ...m2m, ...polys];
}

function generateGraphQLFilterFields(metasByName: Record<string, EntityDbMetadata>, meta: EntityDbMetadata): Code[] {
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
  const m2o = meta.manyToOnes.flatMap(({ fieldName, otherEntity, notNull }) => {
    const otherMeta = metasByName[otherEntity.name];
    return [
      code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${
        otherEntity.type
      }>, ${nullOrNever(notNull)}>;`,
      ...otherMeta.subTypes.map((st) => {
        return code`${fieldName}${st.name}?: ${EntityGraphQLFilter}<${st.entity.type}, ${st.entity.idType}, ${GraphQLFilterOf}<${
          st.entity.type
        }>, ${nullOrNever(notNull)}>;`;
      }),
    ];
  });
  const o2o = meta.oneToOnes.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const o2m = meta.oneToManys.flatMap(({ fieldName, otherEntity, otherColumnNotNull }) => {
    const otherMeta = metasByName[otherEntity.name] ?? fail(`Could not find metadata for ${otherEntity.name}`);
    return [
      code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>, null | undefined>;`,
      ...otherMeta.subTypes.map((st) => {
        return code`${fieldName}${st.name}?: ${EntityGraphQLFilter}<${st.entity.type}, ${st.entity.idType}, ${GraphQLFilterOf}<${
          st.entity.type
        }>, ${nullOrNever(otherColumnNotNull)}>;`;
      }),
    ];
  });
  const m2m = meta.manyToManys.map(({ fieldName, otherEntity }) => {
    return code`${fieldName}?: ${EntityGraphQLFilter}<${otherEntity.type}, ${otherEntity.idType}, ${GraphQLFilterOf}<${otherEntity.type}>, null | undefined>;`;
  });
  const polys = meta.polymorphics.flatMap(({ fieldName, fieldType, components, notNull }) => {
    return [
      code`${fieldName}?: ${EntityGraphQLFilter}<${fieldType}, ${IdOf}<${fieldType}>, never, ${nullOrNever(notNull)}>;`,
      ...components.map((comp) => {
        const { type } = comp.otherEntity;
        return code`${fieldName}${type}?: ${EntityGraphQLFilter}<${type}, ${IdOf}<${type}>, ${FilterOf}<${type}>, null>;`;
      }),
    ];
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

function generateFactoryExtrasType(meta: EntityDbMetadata): Code[] {
  function withName(fieldName: string): string {
    return `with${fieldName[0].toUpperCase() + fieldName.substring(1)}`;
  }
  const primitives = meta.primitives
    .filter((f) => f.derived === "async")
    .map((field) => {
      const { fieldName, fieldType, notNull } = field;
      return code`${withName(fieldName)}?: ${fieldType}${maybeUnionNull(notNull)};`;
    });
  const enums = meta.enums
    .filter((f) => f.derived === "async")
    .map((field) => {
      const { fieldName, enumType, notNull, isArray } = field;
      if (isArray) {
        return code`${withName(fieldName)}?: ${enumType}[];`;
      } else {
        return code`${withName(fieldName)}?: ${enumType}${maybeUnionNull(notNull)};`;
      }
    });
  return [...primitives, ...enums];
}

function createPrimitives(meta: EntityDbMetadata, entity: Entity) {
  const primitives = meta.primitives.map((p) => {
    const { fieldName, fieldType, notNull } = p;
    const maybeOptional = notNull ? "" : " | undefined";

    let getter: Code;
    if (p.derived === "async") {
      getter = code`
        abstract readonly ${fieldName}: ${ReactiveField}<${entity.name}, ${p.fieldType}${maybeOptional}>;
     `;
    } else if (p.derived === "sync") {
      getter = code`
        abstract get ${fieldName}(): ${fieldType}${maybeOptional};
     `;
    } else if (p.zodSchema) {
      getter = code`
        get ${fieldName}(): ${Zod}.output<typeof ${p.zodSchema}>${maybeOptional} {
          return ${getField}(this, "${fieldName}");
        }
     `;
    } else {
      getter = code`
        get ${fieldName}(): ${fieldType}${maybeOptional} {
          return ${getField}(this, "${fieldName}");
        }
     `;
    }

    let setter: Code | string;
    // ...technically we should be checking a list of JS keywords
    const paramName = keywords.includes(fieldName) ? "value" : fieldName;
    if (p.protected) {
      // TODO Allow making the getter to be protected as well. And so probably remove it
      // from the Opts as well. Wonder how that works for required protected fields?
      //
      // We have to use a method of `set${fieldName}` because TS enforces getters/setters to have
      // same access level and currently we're leaving the getter as public.
      setter = code`
        protected set${pascalCase(fieldName)}(${paramName}: ${fieldType}${maybeOptional}) {
          ${setField}(this, "${fieldName}", ${paramName});
        }
      `;
    } else if (p.derived) {
      setter = "";
    } else if (p.superstruct) {
      // We use `value` as the param name to not potentially conflict with the
      // name of the imported superstruct const that is passed to assert.
      setter = code`
        set ${fieldName}(value: ${fieldType}${maybeOptional}) {
          if (value) {
            ${SSAssert}(value, ${p.superstruct});
          }
          ${setField}(this, "${fieldName}", value);
        }
      `;
    } else if (p.zodSchema) {
      // We use `value` as the param name to not potentially conflict with the
      // name of the imported zod schema that is passed to parse.
      setter = code`
        set ${fieldName}(value: ${Zod}.input<typeof ${p.zodSchema}>${maybeOptional}) {
          if (value) {
            ${setField}(this, "${fieldName}", ${p.zodSchema}.parse(value));
          } else {
            ${setField}(this, "${fieldName}", value);
          }
        }
      `;
    } else {
      setter = code`
        set ${fieldName}(${paramName}: ${fieldType}${maybeOptional}) {
          ${setField}(this, "${fieldName}", ${paramName});
        }
      `;
    }

    return code`${getter} ${setter}`;
  });
  return primitives;
}

function createRegularEnums(meta: EntityDbMetadata, entity: Entity) {
  return meta.enums
    .filter((e) => !e.isArray)
    .flatMap((e) => {
      const { fieldName, enumType, enumDetailType, enumDetailsType, notNull, enumRows, derived } = e;
      const maybeOptional = notNull ? "" : " | undefined";
      const getByCode = code`${enumDetailType}.getByCode(this.${fieldName})`;

      let getter: Code;
      if (derived === "async") {
        getter = code`
          abstract readonly ${fieldName}: ${ReactiveField}<${entity.name}, ${enumType}${maybeOptional}>;
       `;
      } else if (derived === "sync") {
        getter = code`
          abstract get ${fieldName}(): ${enumType}${maybeOptional};
       `;
      } else {
        getter = code`
          get ${fieldName}(): ${enumType}${maybeOptional} {
            return ${getField}(this, "${fieldName}");
          }

          get ${fieldName}Details(): ${enumDetailsType}${maybeOptional} {
            return ${notNull ? getByCode : code`this.${fieldName} ? ${getByCode} : undefined`};
          }
       `;
      }

      let setter: Code;
      if (derived) {
        setter = code``;
      } else {
        setter = code`
          set ${fieldName}(${fieldName}: ${enumType}${maybeOptional}) {
            ${setField}(this, "${fieldName}", ${fieldName});
          }
        `;
      }

      const codes = new Set(enumRows.map((r) => r.code));
      const shouldPrefixAccessors = meta.enums
        .filter((other) => other !== e)
        .some((other) => other.enumRows.some((r) => codes.has(r.code)));

      const accessors = enumRows.map(
        (row) => code`
          get is${shouldPrefixAccessors ? pascalCase(fieldName) : ""}${pascalCase(row.code)}(): boolean {
            return ${getField}(this, "${fieldName}") === ${enumType}.${pascalCase(row.code)};
          }
        `,
      );
      return [getter, setter, ...accessors];
    });
}

function createArrayEnums(meta: EntityDbMetadata) {
  return meta.enums
    .filter((e) => e.isArray)
    .flatMap((e) => {
      const { fieldName, enumType, enumDetailType, enumDetailsType, enumRows } = e;
      const getter = code`
        get ${fieldName}(): ${enumType}[] {
          return ${getField}(this, "${fieldName}") || [];
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
      return [getter, setter, ...accessors];
    });
}

function createPgEnums(meta: EntityDbMetadata) {
  return meta.pgEnums.flatMap((e) => {
    const { fieldName, enumType, enumValues, notNull } = e;
    const maybeOptional = notNull ? "" : " | undefined";

    const getter = code`
        get ${fieldName}(): ${enumType}${maybeOptional} {
          return ${getField}(this, "${fieldName}");
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
    return [getter, setter, ...accessors];
  });
}

function createRelations(config: Config, meta: EntityDbMetadata, entity: Entity): Relation[] {
  // Add ManyToOne entities
  const m2o: Relation[] = meta.manyToOnes.map((m2o) => {
    const { fieldName, otherEntity, otherFieldName, notNull } = m2o;
    const maybeOptional = notNull ? "never" : "undefined";
    if (m2o.derived === "async") {
      const line = code`abstract readonly ${fieldName}: ${ReactiveReference}<${entity.name}, ${otherEntity.type}, ${maybeOptional}>;`;
      return { kind: "abstract", line } as const;
    }
    const decl = code`${ManyToOneReference}<${entity.type}, ${otherEntity.type}, ${maybeOptional}>`;
    const init = code`${hasOne}()`;
    return { kind: "concrete", fieldName, decl, init };
  });
  // Specialize
  const m2oBase: Relation[] =
    meta.baseType?.manyToOnes
      // Skip m2os that are already specialized to a different otherEntity, i.e. `SmallPublisher.group: SmallPublisherGroup`
      .filter((m2o) => !meta.manyToOnes.find((o) => o.fieldName === m2o.fieldName))
      // Don't specialize hasReactiveReferences b/c they're fields, not getters
      .filter((m2o) => m2o.derived !== "async")
      .map((m2o) => {
        const { fieldName, otherEntity, notNull } = m2o;
        const maybeOptional = notNull ? "never" : "undefined";
        const decl = code`${ManyToOneReference}<${entity.type}, ${otherEntity.type}, ${maybeOptional}>`;
        return { kind: "super", fieldName, decl };
      }) ?? [];

  // Add any recursive ManyToOne entities
  const m2oRecursive: Relation[] = meta.manyToOnes
    .filter((m2o) => m2o.otherEntity.name === meta.name)
    // Allow disabling recursive relations
    .filter(
      (m2o) =>
        // For STI - look at the baseClassName, since there is actually no configuration for the subtype currently
        !(
          config.entities[meta.inheritanceType == "sti" && meta.baseClassName ? meta.baseClassName : meta.name]
            ?.relations?.[m2o.fieldName]?.skipRecursiveRelations === true
        ),
    )
    // Skip ReactiveReferences because they don't have an `other` side for us to use
    .filter((m2o) => !m2o.derived)
    .flatMap((m2o) => {
      const { fieldName: m2oName, otherFieldName, otherEntity } = m2o;
      const parentsField = `${plural(m2oName)}Recursive`;
      const maybeOneToOne = meta.oneToOnes.find((o2o) => o2o.fieldName === otherFieldName);
      const childrenField = maybeOneToOne ? `${plural(otherFieldName)}Recursive` : `${otherFieldName}Recursive`;
      return [
        {
          kind: "concrete",
          fieldName: parentsField,
          decl: code`${ReadOnlyCollection}<${entity.type}, ${otherEntity.type}>`,
          init: code`${hasRecursiveParents}("${m2oName}", "${childrenField}")`,
        },
        {
          kind: "concrete",
          fieldName: childrenField,
          decl: code`${ReadOnlyCollection}<${entity.type}, ${otherEntity.type}>`,
          init: code`${hasRecursiveChildren}("${otherFieldName}", "${parentsField}")`,
        },
      ];
    });

  // Add OneToMany
  const o2m: Relation[] = meta.oneToManys.map((o2m) => {
    const { fieldName, otherEntity } = o2m;
    const decl = code`${Collection}<${entity.type}, ${otherEntity.type}>`;
    const init = code`${hasMany}()`;
    return { kind: "concrete", fieldName, decl, init };
  });
  // Specialize
  const o2mBase: Relation[] =
    meta.baseType?.oneToManys
      // Skip o2ms that are already specialized to a different otherEntity, i.e. `SmallPublisherGroup.publishers: SmallPublisher`
      .filter((o2m) => !meta.oneToManys.find((o) => o.fieldName === o2m.fieldName))
      .map((o2m) => {
        const { fieldName, otherEntity } = o2m;
        const decl = code`${Collection}<${entity.type}, ${otherEntity.type}>`;
        return { kind: "super", fieldName, decl };
      }) ?? [];

  // Add large OneToMany
  const lo2m: Relation[] = meta.largeOneToManys.map((o2m) => {
    const { fieldName, otherFieldName, otherColumnName, otherEntity } = o2m;
    const decl = code`${LargeCollection}<${entity.type}, ${otherEntity.type}>`;
    const init = code`${hasLargeMany}("${otherFieldName}", "${otherColumnName}")`;
    return { kind: "concrete", fieldName, decl, init };
  });

  // Add OneToOne
  const o2o: Relation[] = meta.oneToOnes.map((o2o) => {
    const { fieldName, otherEntity, otherFieldName, otherColumnName } = o2o;
    const decl = code`${OneToOneReference}<${entity.type}, ${otherEntity.type}>`;
    const init = code`${hasOneToOne}("${otherFieldName}", "${otherColumnName}")`;
    return { kind: "concrete", fieldName, decl, init };
  });
  // Specialize
  const o2oBase: Relation[] =
    meta.baseType?.oneToOnes.map((o2o) => {
      const { fieldName, otherEntity } = o2o;
      const decl = code`${OneToOneReference}<${entity.type}, ${otherEntity.type}>`;
      return { kind: "super", fieldName, decl };
    }) ?? [];

  // Add ManyToMany
  const m2m: Relation[] = meta.manyToManys.map((m2m) => {
    const { joinTableName, fieldName, columnName, otherEntity, otherFieldName, otherColumnName } = m2m;
    if (m2m.derived === "async") {
      const line = code`abstract readonly ${fieldName}: ${ReactiveManyToMany}<${entity.name}, ${otherEntity.type}>;`;
      return { kind: "abstract", line } as const;
    } else if (m2m.derived === "otherSide") {
      const decl = code`${ReactiveManyToManyOtherSide}<${entity.type}, ${otherEntity.type}>`;
      const init = code`${hasReactiveManyToManyOtherSide}()`;
      return { kind: "concrete", fieldName, decl, init };
    } else if (!m2m.derived) {
      const decl = code`${Collection}<${entity.type}, ${otherEntity.type}>`;
      const init = code`
      ${hasManyToMany}(
        "${joinTableName}",
        "${columnName}",
        "${otherFieldName}",
        "${otherColumnName}",
      )`;
      return { kind: "concrete", fieldName, decl, init };
    } else {
      assertNever(m2m.derived);
    }
  });
  // Specialize
  const m2mBase: Relation[] =
    meta.baseType?.manyToManys
      // Don't specialize hasReactiveManyToMany or hasReactiveManyToManyOtherSide b/c they're fields, not getters
      .filter((m2m) => !m2m.derived)
      .map((m2m) => {
        const { fieldName, otherEntity } = m2m;
        const decl = code`${Collection}<${entity.type}, ${otherEntity.type}>`;
        return { kind: "super", fieldName, decl };
      }) ?? [];

  // Add large ManyToMany
  const lm2m: Relation[] = meta.largeManyToManys.map((m2m) => {
    const { joinTableName, fieldName, columnName, otherEntity, otherFieldName, otherColumnName } = m2m;
    const decl = code`${LargeCollection}<${entity.type}, ${otherEntity.type}>`;
    const init = code`
      ${hasLargeManyToMany}(
        "${joinTableName}",
        "${columnName}",
        "${otherFieldName}",
        "${otherColumnName}",
      );
    `;
    return { kind: "concrete", fieldName, decl, init };
  });

  // Add Polymorphic
  const polymorphic: Relation[] = meta.polymorphics.map((p) => {
    const { fieldName, notNull, fieldType } = p;
    const maybeOptional = notNull ? "never" : "undefined";
    const decl = code`${PolymorphicReference}<${entity.type}, ${fieldType}, ${maybeOptional}>`;
    const init = code`${hasOnePolymorphic}()`;
    return { kind: "concrete", fieldName, decl, init };
  });

  return [o2m, o2mBase, lo2m, m2o, m2oBase, m2oRecursive, o2o, o2oBase, m2m, m2mBase, lm2m, polymorphic].flat();
}

/** Makes the field required if there is a `NOT NULL` and no db-or-config default. */
function maybeOptionalOrDefault(
  field: PrimitiveField | EnumField | PgEnumField | ManyToOneField | PolymorphicField,
): string {
  const hasDefault =
    (field.kind !== "m2o" && field.kind !== "poly" && fieldHasDefaultValue(field)) || field.hasConfigDefault;
  return !field.notNull || hasDefault ? "?" : "";
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

export function getIdType(config: Config) {
  switch (config.idType) {
    case "untagged-string":
    case "tagged-string":
    case undefined:
      return "string";
    case "number":
      return "number";
    default:
      return assertNever(config.idType);
  }
}
