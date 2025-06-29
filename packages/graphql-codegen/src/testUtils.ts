import { snakeCase } from "change-case";
import { DbMetadata, EntityDbMetadata, EnumField, makeEntity, ManyToOneField, PrimitiveField } from "joist-codegen";
import { keyBy } from "joist-utils";
import { plural } from "pluralize";
import { imp } from "ts-poet";
import { Fs } from "./utils";

export function newFs(files: Record<string, string>): Fs {
  return {
    exists: async (fileName) => !!files[fileName],
    load: async (fileName) => files[fileName],
    save: async (fileName, content) => {
      files[fileName] = content;
    },
  };
}

export function newDbMeta(opt: EntityDbMetadata[] | Partial<DbMetadata>): DbMetadata {
  const entities = Array.isArray(opt) ? opt : (opt.entities ?? []);
  const entitiesByName = keyBy(entities, "name");
  // Hook up baseType/subTypes
  for (const entity of entities) {
    if (entity.baseClassName) {
      const baseType = entitiesByName[entity.baseClassName];
      entity.baseType = baseType;
      baseType.subTypes.push(entity);
    }
  }
  return {
    entities,
    enums: {},
    pgEnums: {},
    joinTables: [],
    totalTables: 10,
    entitiesByName,
  };
}

export function newPrimitiveField(fieldName: string, opts: Partial<PrimitiveField> = {}): PrimitiveField {
  return {
    kind: "primitive",
    fieldName,
    columnName: snakeCase(fieldName),
    columnType: "varchar",
    fieldType: "string",
    rawFieldType: "string",
    derived: false,
    notNull: true,
    protected: false,
    unique: false,
    columnDefault: null,
    superstruct: undefined,
    zodSchema: undefined,
    customSerde: undefined,
    isArray: false,
    hasConfigDefault: false,
    ...opts,
  };
}

export function newEntityMetadata(name: string, opts: Partial<EntityDbMetadata> = {}): EntityDbMetadata {
  return {
    name,
    entity: makeEntity(name),
    primaryKey: newPrimitiveField("id", { columnType: "int", fieldType: "number", rawFieldType: "number" }),
    primitives: [],
    enums: [],
    pgEnums: [],
    manyToOnes: [],
    oneToManys: [],
    largeOneToManys: [],
    manyToManys: [],
    largeManyToManys: [],
    oneToOnes: [],
    polymorphics: [],
    tableName: snakeCase(plural(name)),
    tagName: name,
    updatedAt: undefined,
    createdAt: undefined,
    deletedAt: undefined,
    baseClassName: undefined,
    baseType: undefined,
    subTypes: [],
    inheritanceType: undefined,
    abstract: false,
    nonDeferredFkOrder: 0,
    get nonDeferredFks() {
      return [];
    },
    get nonDeferredManyToManyFks() {
      return [];
    },
    ...opts,
  };
}

export function newEnumField(fieldName: string, opts: Partial<EnumField> = {}): EnumField {
  const enumName = opts.enumName || "Color";
  const enumType = imp(`${enumName}@./entities`);
  const enumDetailType = imp(`${plural(enumName)}@./entities`);
  const enumDetailsType = imp(`${enumName}Details@./entities`);
  return {
    kind: "enum",
    fieldName,
    columnName: snakeCase(fieldName),
    columnType: "int",
    columnDefault: null,
    derived: false,
    enumName,
    enumType,
    enumDetailType,
    enumDetailsType,
    notNull: true,
    enumRows: [],
    isArray: false,
    hasConfigDefault: false,
    ...opts,
  };
}

export function newManyToOneField(
  fieldName: string,
  otherEntity: string,
  opts: Partial<ManyToOneField> = {},
): ManyToOneField {
  return {
    kind: "m2o",
    fieldName,
    columnName: snakeCase(fieldName),
    derived: false,
    notNull: true,
    hasConfigDefault: false,
    dbType: "int",
    otherFieldName: `other${fieldName}`,
    otherEntity: makeEntity(otherEntity),
    isDeferredAndDeferrable: true,
    constraintName: "",
    onDelete: "NO ACTION" as any,
    ...opts,
  };
}
