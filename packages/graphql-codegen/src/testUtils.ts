import { snakeCase } from "change-case";
import { EntityDbMetadata, EnumField, makeEntity, PrimitiveField } from "joist-codegen";
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
    inheritanceType: undefined,
    abstract: false,
    invalidDeferredFK: false,
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
    enumName,
    enumType,
    enumDetailType,
    enumDetailsType,
    notNull: true,
    enumRows: [],
    isArray: false,
    ...opts,
  };
}
