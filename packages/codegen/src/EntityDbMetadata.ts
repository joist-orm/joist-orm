import { camelCase, pascalCase, snakeCase } from "change-case";
import { groupBy } from "joist-utils";
import { Action, Column, EnumType, Index, JSONData, M2MRelation, M2ORelation, O2MRelation, Table } from "pg-structure";
import { plural, singular } from "pluralize";
import { Code, Import, code, imp } from "ts-poet";
import {
  Config,
  fieldTypeConfig,
  getTimestampConfig,
  isFieldIgnored,
  isGetterField,
  isLargeCollection,
  isProtected,
  isReactiveField,
  isReactiveReference,
  ormMaintainedFields,
  serdeConfig,
  superstructConfig,
  zodSchemaConfig,
} from "./config";
import { EnumMetadata, EnumRow, PgEnumMetadata } from "./loadMetadata";
import { Zod } from "./symbols";
import {
  fail,
  isEnumTable,
  isJoinTable,
  isSubClassTable,
  mapSimpleDbTypeToTypescriptType,
  parseOrder,
  tableToEntityName,
} from "./utils";

/** All the entities + enums in our database. */
export interface DbMetadata {
  entities: EntityDbMetadata[];
  /** Type name i.e. `Author` to metadata. */
  entitiesByName: Record<string, EntityDbMetadata>;
  enums: EnumMetadata;
  pgEnums: PgEnumMetadata;
  joinTables: string[];
  totalTables: number;
}

/** Codegen-time metadata about a given domain entity. */
export type Entity = {
  name: string;
  /** The symbol pointing to the entity itself. */
  type: Import;
  /** The symbol pointing to the entity itself, directly rather than via entities.ts */
  typeForMetadataFile: Import;
  /** The name of the entity's runtime metadata const. */
  metaName: string;
  /** The symbol pointing to the entity's runtime metadata const. */
  metaType: Import;
  /** The symbol pointing to the entity's EntityId type. */
  idType: Import;
  /** The symbol pointing to the entity's Order type. */
  orderType: Import;
  /** The symbol pointing to the entity's config const. */
  configConst: Import;
  optsType: Import;
};

export type DatabaseColumnType =
  | "boolean"
  | "int"
  | "uuid"
  | "numeric"
  | "smallint"
  | "integer"
  | "bigint"
  | "decimal"
  | "real"
  | "smallserial"
  | "serial"
  | "bigserial"
  | "double precision"
  | "text"
  | "citext"
  | "character varying"
  | "varchar"
  | "timestamp with time zone"
  | "timestamp without time zone"
  | "date"
  | "jsonb"
  | "bytea"
  | "tsvector"
  | "tstzrange";

/**
 * A logical entity field.
 *
 * I.e. it may be a physical db column, or multiple physical db columns, or a "virtual" field like
 * the one-to-many collection side of a many-to-one foreign key. */
interface Field {
  fieldName: string;
  ignore?: boolean;
}

export type PrimitiveTypescriptType = "boolean" | "string" | "number" | "Object" | "bigint" | "Uint8Array" | Code;

export type PrimitiveField = Field & {
  kind: "primitive";
  columnName: string;
  columnType: DatabaseColumnType;
  columnDefault: number | boolean | string | null;
  // The fieldType might be code for jsonb columns or primitive array columns, i.e. string[]
  fieldType: PrimitiveTypescriptType | Import;
  rawFieldType: PrimitiveTypescriptType;
  notNull: boolean;
  derived: "orm" | "sync" | "async" | "default" | false;
  protected: boolean;
  unique: boolean;
  superstruct: Import | undefined;
  zodSchema: Import | undefined;
  customSerde: Import | undefined;
  isArray: boolean;
  hasConfigDefault: boolean;
};

export type EnumField = Field & {
  kind: "enum";
  columnName: string;
  columnType: DatabaseColumnType;
  columnDefault: number | boolean | string | null;
  derived: "sync" | "async" | "default" | false;
  enumName: string;
  enumType: Import;
  enumDetailType: Import;
  enumDetailsType: Import;
  enumRows: EnumRow[];
  notNull: boolean;
  isArray: boolean;
  hasConfigDefault: boolean;
};

export type PgEnumField = Field & {
  kind: "pg-enum";
  columnName: string;
  columnDefault: number | boolean | string | null;
  derived: "sync" | "async" | "default" | false;
  /** I.e. `favorite_shape`. */
  dbType: string;
  /** I.e. `FavoriteShape`. */
  enumName: string;
  enumType: Import;
  enumValues: string[];
  notNull: boolean;
  hasConfigDefault: boolean;
};

/** I.e. a `Book.author` reference pointing to an `Author`. */
export type ManyToOneField = Field & {
  kind: "m2o";
  columnName: string;
  dbType: string;
  otherFieldName: string;
  otherEntity: Entity;
  notNull: boolean;
  isDeferredAndDeferrable: boolean;
  constraintName: string;
  derived: "async" | "default" | false;
  hasConfigDefault: boolean;
  onDelete: Action;
};

/** I.e. a `Author.books` collection. */
export type OneToManyField = Field & {
  kind: "o2m";
  singularName: string;
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
  otherColumnNotNull: boolean;
  isLargeCollection: boolean;
  orderBy: { field: string; direction: "ASC" | "DESC" } | undefined;
};

/** I.e. a `Author.image` reference when `image.author_id` is unique. */
export type OneToOneField = Field & {
  kind: "o2o";
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
  otherColumnNotNull: boolean;
};

export type ManyToManyField = Field & {
  kind: "m2m";
  joinTableName: string;
  singularName: string;
  columnName: string;
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
  isLargeCollection: boolean;
};

/** I.e. a `Comment.parent` reference that groups `comments.parent_book_id` and `comments.parent_book_review_id`. */
export type PolymorphicField = Field & {
  kind: "poly";
  fieldType: string; // The name of the type union, eg `CommentParent`
  notNull: boolean;
  derived?: "default";
  hasConfigDefault: boolean;
  components: PolymorphicFieldComponent[];
};

export type PolymorphicFieldComponent = {
  columnName: string; // eg `parent_book_id` or `parent_book_review_id`
  otherFieldName: string; // eg `comment` or `comments`
  otherEntity: Entity;
  isDeferredAndDeferrable: boolean;
  constraintName: string;
  notNull: false; // Added to structurally match ManyToOneField
};

export type FieldNameOverrides = {
  fieldName?: string;
  otherFieldName?: string;
};

/** Adapts the generally-great pg-structure metadata into our specific ORM types. */
export class EntityDbMetadata {
  entity: Entity;
  primaryKey: PrimitiveField;
  primitives: PrimitiveField[];
  enums: EnumField[];
  pgEnums: PgEnumField[];
  manyToOnes: ManyToOneField[];
  oneToManys: OneToManyField[];
  largeOneToManys: OneToManyField[];
  oneToOnes: OneToOneField[];
  manyToManys: ManyToManyField[];
  largeManyToManys: ManyToManyField[];
  polymorphics: PolymorphicField[];
  tableName: string;
  tagName: string;
  createdAt: PrimitiveField | undefined;
  updatedAt: PrimitiveField | undefined;
  deletedAt: PrimitiveField | undefined;
  baseClassName: string | undefined;
  baseType: EntityDbMetadata | undefined;
  subTypes: EntityDbMetadata[] = [];
  inheritanceType: "sti" | "cti" | undefined;
  /** This will only be set on the base meta. */
  stiDiscriminatorField?: string;
  /** This will only be set on the sub metas. */
  stiDiscriminatorValue?: number;
  abstract: boolean;
  nonDeferredFkOrder: number = -1;

  constructor(config: Config, table: Table, enums: EnumMetadata = {}) {
    this.entity = makeEntity(tableToEntityName(config, table));

    if (isSubClassTable(table)) {
      this.baseClassName = tableToEntityName(config, table.columns.get("id").foreignKeys[0].referencedTable);
      this.inheritanceType = "cti";
    }

    this.primaryKey =
      table.columns
        .filter((c) => c.isPrimaryKey)
        .map((column) => newPrimitive(config, this.entity, column, table))[0] ||
      fail(`No primary key found for ${table.name}`);

    this.primitives = table.columns
      .filter((c) => !c.isPrimaryKey && !c.isForeignKey)
      .filter((c) => !isEnumArray(c) && !isPgEnum(c))
      .map((column) => newPrimitive(config, this.entity, column, table))
      .filter((f) => !f.ignore);

    this.enums = [
      ...table.m2oRelations
        .filter((r) => isEnumTable(config, r.targetTable))
        .map((r) => newEnumField(config, this.entity, r, enums))
        .filter((f) => !f.ignore),
      ...table.columns
        .filter((c) => isEnumArray(c))
        .map((column) => newEnumArrayField(config, this.entity, column, enums))
        .filter((f) => !f.ignore),
    ];
    this.pgEnums = [
      ...table.columns
        .filter((c) => isPgEnum(c))
        .map((column) => newPgEnumField(config, this.entity, column))
        .filter((f) => !f.ignore),
    ];

    this.manyToOnes = table.m2oRelations
      .filter((r) => !isEnumTable(config, r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .filter((r) => !isComponentOfPolymorphicRelation(config, r))
      .filter((r) => !isBaseClassForeignKey(r))
      .map((r) => newManyToOneField(config, this.entity, r))
      .filter((f) => !f.ignore);

    // We split these into regular/large...
    const allOneToManys = table.o2mRelations
      // ManyToMany join tables also show up as OneToMany tables in pg-structure
      .filter((r) => !isJoinTable(config, r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .filter((r) => !isOneToOneRelation(r))
      .map((r) => newOneToMany(config, this.entity, r))
      // Do not generate o2m for persisted async derived fields
      .filter((f) => !isReactiveReference(config, f.otherEntity, f.otherFieldName))
      .filter((f) => !f.ignore);
    this.oneToManys = allOneToManys.filter((f) => !f.isLargeCollection);
    this.largeOneToManys = allOneToManys.filter((f) => f.isLargeCollection);

    this.oneToOnes = table.o2mRelations
      // ManyToMany join tables also show up as OneToMany tables in pg-structure
      .filter((r) => !isJoinTable(config, r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .filter((r) => !isBaseClassForeignKey(r))
      .filter((r) => isOneToOneRelation(r))
      .map((r) => newOneToOne(config, this.entity, r))
      .filter((f) => !f.ignore);

    // We split these into regular/large
    const allManyToManys = table.m2mRelations
      // pg-structure is really loose on what it considers a m2m relationship, i.e. any entity
      // that has a foreign key to us, and a foreign key to something else, is automatically
      // considered as a join table/m2m between "us" and "something else". Filter these out
      // by looking for only true join tables, i.e. tables with only id, fk1, and fk2.
      .filter((r) => isJoinTable(config, r.joinTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .map((r) => newManyToManyField(config, this.entity, r))
      .filter((f) => !f.ignore);
    this.manyToManys = allManyToManys.filter((f) => !f.isLargeCollection);
    this.largeManyToManys = allManyToManys.filter((f) => f.isLargeCollection);

    this.polymorphics = polymorphicRelations(config, table).map((rc) =>
      newPolymorphicField(config, table, this.entity, rc),
    );

    this.tableName = table.name;
    this.tagName = config.entities[this.entity.name]?.tag;
    this.abstract = config.entities[this.entity.name]?.abstract || false;

    const { createdAtConf, updatedAtConf, deletedAtConf } = getTimestampConfig(config);
    this.createdAt = this.primitives.find((f) => createdAtConf.names.includes(f.columnName));
    this.updatedAt = this.primitives.find((f) => updatedAtConf.names.includes(f.columnName));
    this.deletedAt = this.primitives.find((f) => deletedAtConf.names.includes(f.columnName));
  }

  get name(): string {
    return this.entity.name;
  }

  get nonDeferredFks(): Array<ManyToOneField | PolymorphicFieldComponent> {
    return [
      ...this.manyToOnes.filter((r) => !r.isDeferredAndDeferrable),
      ...this.polymorphics.flatMap((p) => p.components).filter((c) => !c.isDeferredAndDeferrable),
    ];
  }
}

function isMultiColumnForeignKey(r: M2ORelation | O2MRelation | M2MRelation) {
  return r.foreignKey.columns.length > 1;
}

function isBaseClassForeignKey(r: M2ORelation | O2MRelation | M2MRelation) {
  return r.foreignKey.columns.length === 1 && r.foreignKey.columns[0].name === "id";
}

function isOneToOneRelation(r: O2MRelation) {
  // otherColumn will be the images.book_id in the other table
  const otherColumn = r.foreignKey.columns[0];
  // r.foreignKey.index is the index on _us_ (i.e. our Book primary key), so look up indexes in the target table
  const indexes = r.targetTable.columns.find((c) => c.name == otherColumn.name)?.uniqueIndexes || [];
  return indexes.find(isOneToOneIndex) !== undefined;
}

// If the unique index has only one column and is NOT a partial index, it's a one-to-one
function isOneToOneIndex(i: Index) {
  return i.columns.length === 1 && !i.isPartial;
}

type PolymorphicRelation = { fieldName: string; notNull: boolean };
function polymorphicRelations(config: Config, table: Table): PolymorphicRelation[] {
  const entity = config.entities[tableToEntityName(config, table)];
  return Object.entries(entity?.relations ?? {})
    .filter(([, r]) => r.polymorphic)
    .map(([fieldName, { polymorphic }]) => ({ fieldName, notNull: polymorphic === "notNull" }));
}

function polymorphicFieldName(config: Config, r: M2ORelation | O2MRelation) {
  const { name } = r.foreignKey.columns[0];
  const table = r.type === "m2o" ? r.sourceTable : r.targetTable;
  return polymorphicRelations(config, table).find((pr) => name.startsWith(`${snakeCase(pr.fieldName)}_`))?.fieldName;
}

function isComponentOfPolymorphicRelation(config: Config, r: M2ORelation) {
  return polymorphicFieldName(config, r) !== undefined;
}

function determineUserType(
  fieldType: PrimitiveTypescriptType,
  superstruct: string | undefined,
  zodSchema: string | undefined,
  userFieldType: string | undefined,
) {
  if (fieldType === "Object" && superstruct) {
    return superstructType(superstruct);
  }

  if (fieldType === "Object" && zodSchema) {
    return zodSchemaType(zodSchema);
  }

  if (userFieldType) {
    return userFieldTypeType(userFieldType);
  }

  return fieldType;
}

function newPrimitive(config: Config, entity: Entity, column: Column, table: Table): PrimitiveField {
  const fieldName = primitiveFieldName(column.name);
  const columnName = column.name;
  const columnType = (column.type.shortName || column.type.name) as DatabaseColumnType;
  const array = isArray(column);
  const fieldType = mapType(config, table.name, columnName, columnType);
  const customSerde = serdeConfig(config, entity, fieldName);
  const superstruct = superstructConfig(config, entity, fieldName);
  const zodSchema = zodSchemaConfig(config, entity, fieldName);
  const userFieldType = fieldTypeConfig(config, entity, fieldName);
  const maybeUserType = determineUserType(fieldType, superstruct, zodSchema, userFieldType);
  const unique = column.uniqueIndexes.find(isOneToOneIndex) !== undefined;
  return {
    kind: "primitive",
    fieldName,
    columnName,
    columnType,
    fieldType: array ? code`${fieldType}[]` : maybeUserType,
    rawFieldType: fieldType,
    notNull: column.notNull,
    columnDefault: column.default,
    derived: fieldDerived(config, entity, fieldName, column.default),
    protected: isProtected(config, entity, fieldName),
    unique,
    ignore: isFieldIgnored(config, entity, fieldName, column.notNull, column.default !== null),
    superstruct: fieldType === "Object" && superstruct ? Import.from(superstruct) : undefined,
    zodSchema: fieldType === "Object" && zodSchema ? Import.from(zodSchema) : undefined,
    customSerde: customSerde ? serdeType(customSerde) : undefined,
    isArray: array,
    hasConfigDefault: false, // updated by scanEntityFiles
  };
}

function fieldDerived(
  config: Config,
  entity: Entity,
  fieldName: string,
  columnDefault: unknown,
): PrimitiveField["derived"] {
  if (ormMaintainedFields.includes(fieldName)) {
    return "orm";
  } else if (isGetterField(config, entity, fieldName)) {
    return "sync";
  } else if (isReactiveField(config, entity, fieldName)) {
    return "async";
  } else if (columnDefault) {
    return "default";
  } else {
    return false;
  }
}

function fkFieldDerived(config: Config, entity: Entity, fieldName: string): ManyToOneField["derived"] {
  if (isReactiveReference(config, entity, fieldName)) {
    return "async";
  } else {
    return false;
  }
}

function newEnumField(config: Config, entity: Entity, r: M2ORelation, enums: EnumMetadata): EnumField {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const columnType = (column.type.shortName || column.type.name) as DatabaseColumnType;
  const fieldName = enumFieldName(column.name);
  const enumName = tableToEntityName(config, r.targetTable);
  const enumType = imp(`${enumName}@./entities.ts`);
  const enumDetailType = imp(`${plural(enumName)}@./entities.ts`);
  const enumDetailsType = imp(`${enumName}Details@./entities.ts`);
  const notNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName, notNull, column.default !== null);
  return {
    kind: "enum",
    fieldName,
    columnName,
    columnType,
    columnDefault: column.default,
    derived: fieldDerived(config, entity, fieldName, column.default) as EnumField["derived"],
    enumName,
    enumType,
    enumDetailType,
    enumDetailsType,
    notNull,
    ignore,
    enumRows: enums[r.targetTable.name].rows,
    isArray: false,
    hasConfigDefault: false, // updated by scanEntityFiles
  };
}

function newEnumArrayField(config: Config, entity: Entity, column: Column, enums: EnumMetadata): EnumField {
  const columnName = column.name;
  const columnType = (column.type.shortName || column.type.name) as DatabaseColumnType;
  const fieldName = enumFieldName(column.name);
  // Find the enum table name via the comment hint (instead of a FK constraint), and strip the enum= prefix
  const enumTable = column.comment!.replace("enum=", "");
  const enumName = (enums[enumTable] || fail(`Could not find enum ${enumTable}`)).name;
  const enumType = imp(`${enumName}@./entities.ts`);
  const enumDetailType = imp(`${plural(enumName)}@./entities.ts`);
  const enumDetailsType = imp(`${enumName}Details@./entities.ts`);
  const notNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName, notNull, column.default !== null);
  return {
    kind: "enum",
    fieldName,
    columnName,
    columnType,
    columnDefault: column.default,
    derived: fieldDerived(config, entity, fieldName, column.default) as EnumField["derived"],
    enumName,
    enumType,
    enumDetailType,
    enumDetailsType,
    notNull,
    ignore,
    enumRows: enums[enumTable].rows,
    isArray: true,
    hasConfigDefault: false, // updated by scanEntityFiles
  };
}

function newPgEnumField(config: Config, entity: Entity, column: Column): PgEnumField {
  const fieldName = primitiveFieldName(column.name);
  const columnName = column.name;
  const enumName = pascalCase(column.type.name);
  const enumType = imp(`${enumName}@./entities.ts`);
  return {
    kind: "pg-enum",
    fieldName,
    columnName,
    dbType: column.type.name,
    enumType,
    enumName,
    enumValues: (column.type as EnumType).values,
    notNull: column.notNull,
    columnDefault: column.default,
    derived: fieldDerived(config, entity, fieldName, column.default) as EnumField["derived"],
    ignore: isFieldIgnored(config, entity, fieldName, column.notNull, column.default !== null),
    hasConfigDefault: false, // updated by scanEntityFiles
  };
}

function newManyToOneField(config: Config, entity: Entity, r: M2ORelation): ManyToOneField {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const dbType = r.foreignKey.columns[0].type.shortName!;
  const fieldName = referenceName(config, entity, r);
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const isOneToOne = column.uniqueIndexes.find(isOneToOneIndex) !== undefined;
  const otherFieldName = isOneToOne
    ? oneToOneName(config, otherEntity, entity, r)
    : collectionName(config, otherEntity, entity, r).fieldName;
  const notNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName, notNull, column.default !== null);
  const isDeferredAndDeferrable = r.foreignKey.isDeferred && r.foreignKey.isDeferrable;
  const derived = fkFieldDerived(config, entity, fieldName);
  return {
    kind: "m2o",
    fieldName,
    columnName,
    otherEntity,
    otherFieldName,
    notNull,
    ignore,
    derived,
    dbType,
    isDeferredAndDeferrable,
    constraintName: r.foreignKey.name,
    hasConfigDefault: false, // updated by scanEntityFiles
    onDelete: r.foreignKey.onDelete,
  };
}

function newOneToMany(config: Config, entity: Entity, r: O2MRelation): OneToManyField {
  const column = r.foreignKey.columns[0];
  // source == parent i.e. the reference of the foreign key column
  // target == child i.e. the table with the foreign key column in it
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const { singularName, fieldName } = collectionName(config, entity, otherEntity, r);
  const otherFieldName = referenceName(config, otherEntity, r);
  const orderBy =
    config.entities[entity.name]?.relations?.[fieldName]?.orderBy ?? config.entities[otherEntity.name]?.orderBy;
  return {
    kind: "o2m",
    fieldName,
    singularName,
    otherEntity,
    otherFieldName,
    otherColumnName: column.name,
    otherColumnNotNull: column.notNull,
    ignore: isFieldIgnored(config, entity, fieldName) || isFieldIgnored(config, otherEntity, otherFieldName),
    isLargeCollection: isLargeCollection(config, entity, fieldName),
    orderBy: parseOrder(orderBy),
  };
}

function newOneToOne(config: Config, entity: Entity, r: O2MRelation): OneToOneField {
  const column = r.foreignKey.columns[0];
  // source == parent i.e. the reference of the foreign key column
  // target == child i.e. the table with the foreign key column in it
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const fieldName = oneToOneName(config, entity, otherEntity, r);
  const otherFieldName = referenceName(config, otherEntity, r);
  const otherColumnName = column.name;
  const otherColumnNotNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName) || isFieldIgnored(config, otherEntity, otherFieldName);
  return { kind: "o2o", fieldName, otherEntity, otherFieldName, otherColumnName, otherColumnNotNull, ignore };
}

function newManyToManyField(config: Config, entity: Entity, r: M2MRelation): ManyToManyField {
  const { foreignKey, targetForeignKey, targetTable } = r;
  const otherEntity = makeEntity(tableToEntityName(config, targetTable));
  // For foo_to_bar.some_foo_id use the `some_foo_id` column i.e. `someFoos`
  const fieldName = manyToManyName(targetForeignKey.columns[0]);
  const otherFieldName = manyToManyName(foreignKey.columns[0]);
  return {
    kind: "m2m",
    joinTableName: r.joinTable.name,
    fieldName,
    singularName: singular(fieldName),
    columnName: foreignKey.columns[0].name,
    otherEntity,
    otherFieldName,
    otherColumnName: targetForeignKey.columns[0].name,
    ignore: isFieldIgnored(config, entity, fieldName) || isFieldIgnored(config, otherEntity, otherFieldName),
    isLargeCollection: isLargeCollection(config, entity, fieldName),
  };
}

function newPolymorphicField(config: Config, table: Table, entity: Entity, pr: PolymorphicRelation) {
  const { fieldName, notNull } = pr;
  const components = table.m2oRelations
    .filter((r) => !isEnumTable(config, r.targetTable))
    .filter((r) => !isMultiColumnForeignKey(r))
    .filter((r) => polymorphicFieldName(config, r) === fieldName)
    .map((r) => newPolymorphicFieldComponent(config, entity, r));
  const fieldType = `${entity.name}${pascalCase(fieldName)}`;
  return {
    kind: "poly" as const,
    fieldName,
    fieldType,
    notNull,
    components,
    hasConfigDefault: false, // updated by scanEntityFiles
  };
}

function newPolymorphicFieldComponent(config: Config, entity: Entity, r: M2ORelation): PolymorphicFieldComponent {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const isOneToOne = column.uniqueIndexes.find(isOneToOneIndex) !== undefined;
  const otherFieldName = isOneToOne
    ? oneToOneName(config, otherEntity, entity, r)
    : collectionName(config, otherEntity, entity, r).fieldName;
  const isDeferredAndDeferrable = r.foreignKey.isDeferred && r.foreignKey.isDeferrable;
  return {
    columnName,
    otherEntity,
    otherFieldName,
    isDeferredAndDeferrable,
    constraintName: r.foreignKey.name,
    notNull: false,
  };
}

function isFieldNameOverrides(maybeOverride: JSONData | undefined): maybeOverride is FieldNameOverrides {
  return (
    maybeOverride !== null &&
    !Array.isArray(maybeOverride) &&
    typeof maybeOverride === "object" &&
    Object.keys(maybeOverride).some((k) => k === "fieldName" || k === "otherFieldName")
  );
}

/** Finds the field name for o2o side of a o2o/m2o. */
export function oneToOneName(
  config: Config,
  //  I.e. the Book for o2o Book.image <-- `images.book_id`
  refEntity: Entity,
  // I.e. the Image for o2o Book.image <-- `images.book_id`
  keyEntity: Entity,
  r: M2ORelation | O2MRelation,
): string {
  // If the name is overridden then use that
  const overrides = r.foreignKey.columns[0].commentData;
  if (isFieldNameOverrides(overrides) && overrides.otherFieldName) {
    return overrides.otherFieldName;
  }
  // For `comments.parent_book_review_id`, we would just use `BookReview.comment` as the name
  // For `authors.draft_current_book_id`, we would just use `Book.author` as the name
  // For `project_items.current_selection_id`, we would use `HomeownerSelection.currentProjectItem`
  const refTable = r instanceof M2ORelation ? r.targetTable : r.sourceTable;
  // Does the ref table have any m2o pointing table at the key table?
  const found = refTable.m2oRelations.find((s) => tableToEntityName(config, s.targetTable) === keyEntity.name);
  // console.log({refTable: refTable.name, keyTable: keyTable.name, found: found?.name, fieldName});
  if (!found) {
    // If there aren't any m2os, just use the raw type name like `.image` or `.comment`
    return camelCase(keyEntity.name);
  } else {
    // If there is a m2o, assume we might conflict, and use the column name to at least be unique
    // Start with `book` from `images.book_id` or `current_draft_book` from `authors.current_draft_book_id`
    let fieldName = r.foreignKey.columns[0].name.replace(/_id|Id$/, "");
    // Suffix the new type that we're pointing to, to `current_draft_book_author`
    fieldName = `${fieldName}_${keyEntity.name}`;
    // And drop the `book`, to `current_draft__author`
    fieldName = fieldName.replace(refEntity.name.toLowerCase(), "");
    // Then camel case, to `currentDraftAuthor`
    return camelCase(fieldName);
  }
}

export function referenceName(config: Config, entity: Entity, r: M2ORelation | O2MRelation): string {
  const [column] = r.foreignKey.columns;
  const overrides = column.commentData;
  return (
    polymorphicFieldName(config, r) ??
    // If the name is overridden then use that
    (isFieldNameOverrides(overrides) ? overrides.fieldName : undefined) ??
    camelCase(column.name.replace(/_id|Id$/, ""))
  );
}

function enumFieldName(columnName: string) {
  return camelCase(columnName.replace(/_id|Id$/, ""));
}

function primitiveFieldName(columnName: string) {
  return camelCase(columnName);
}

export function manyToManyName(column: Column) {
  const overrides = column.commentData;
  // If the name is overridden then use that
  if (isFieldNameOverrides(overrides) && overrides.otherFieldName) {
    return overrides.otherFieldName;
  }
  return camelCase(plural(column.name.replace(/_id|Id$/, "")));
}

/** Returns the collection name to use on `entity` when referring to `otherEntity`s. */
export function collectionName(
  config: Config,
  // I.e. the Author for o2m Author.books --> books.author_id
  singleEntity: Entity,
  // I.e. the Book for o2m Author.books --> books.author_id
  collectionEntity: Entity,
  r: M2ORelation | O2MRelation | M2MRelation,
): { fieldName: string; singularName: string } {
  const [column] = r.foreignKey.columns;
  const overrides = column.commentData;
  // If the name is overridden then use that, but also singularize it
  if (isFieldNameOverrides(overrides) && overrides.otherFieldName) {
    const fieldName = overrides.otherFieldName;
    return { fieldName, singularName: singular(fieldName) };
  }
  // I.e. if the m2o is `books.author_id`, use `Author.books` as the collection name (we pluralize at the end).
  let singularName = collectionEntity.name;
  // Check if we have multiple FKs from collectionEntity --> singleEntity and prefix with FK name if so
  const sourceTable = r.type === "m2o" ? r.sourceTable : r.targetTable;
  const targetTable = r.type === "m2o" ? r.targetTable : r.sourceTable;
  // If `books.foo_author_id` and `books.bar_author_id` both exist
  if (r.type !== "m2m" && sourceTable.m2oRelations.filter((r) => r.targetTable === targetTable).length > 1) {
    // Use `fooAuthorBooks`, `barAuthorBooks`
    singularName = `${column.name.replace(/_id|Id$/, "")}_${singularName}`;
  }
  // If we've guessed `Book.bookReviews` based on `book_reviews.book_id` --> `bookReviews`, strip the `Book` prefix
  if (singularName.length > singleEntity.name.length && singularName.startsWith(singleEntity.name)) {
    singularName = singularName.substring(singleEntity.name.length);
  }
  // camelize the name
  singularName = camelCase(singularName);
  // and pluralize for fieldName
  return { fieldName: plural(singularName), singularName };
}

export function failIfOverlappingFieldNames(entity: EntityDbMetadata): void {
  const allFields = [
    entity.primaryKey,
    ...entity.primitives,
    ...entity.enums,
    ...entity.pgEnums,
    ...entity.manyToOnes,
    ...entity.oneToManys,
    ...entity.largeOneToManys,
    ...entity.oneToOnes,
    ...entity.manyToManys,
    ...entity.largeManyToManys,
    ...entity.polymorphics,
  ];
  Object.entries(groupBy(allFields, (f) => f.fieldName)).forEach(([fieldName, fields]) => {
    if (fields.length > 1) {
      throw new Error(
        `In ${entity.name}, found multiple fields named '${fieldName}': ${fields.map((f) => f.kind).join(" ")}`,
      );
    }
  });
}

export function makeEntity(entityName: string): Entity {
  return {
    name: entityName,
    type: entityType(entityName),
    typeForMetadataFile: entityTypeForMetadataFile(entityName),
    metaName: metaName(entityName),
    metaType: metaType(entityName),
    idType: imp(`t:${entityName}Id@./entities.ts`, { definedIn: `./codegen/${entityName}Codegen.ts` }),
    orderType: imp(`t:${entityName}Order@./entities.ts`, { definedIn: `./codegen/${entityName}Codegen.ts` }),
    optsType: imp(`t:${entityName}Opts@./entities.ts`, { definedIn: `./codegen/${entityName}Codegen.ts` }),
    configConst: imp(`${camelCase(entityName)}Config@./entities.ts`, {
      definedIn: `./codegen/${entityName}Codegen.ts`,
    }),
  };
}

function metaName(entityName: string): string {
  return `${camelCase(entityName)}Meta`;
}

function metaType(entityName: string): Import {
  return imp(`${metaName(entityName)}@./entities.ts`);
}

function entityType(entityName: string): Import {
  return imp(`${entityName}@./entities.ts`);
}

function entityTypeForMetadataFile(entityName: string): Import {
  return imp(`${entityName}@./${entityName}.ts`);
}

function mapType(
  config: Config,
  tableName: string,
  columnName: string,
  dbColumnType: DatabaseColumnType,
): PrimitiveTypescriptType {
  return mapSimpleDbTypeToTypescriptType(config, dbColumnType);
}

function isEnumArray(c: Column): boolean {
  return c.arrayDimension === 1 && !!c.comment && c.comment.startsWith("enum=");
}

function isArray(c: Column): boolean {
  return c.arrayDimension === 1;
}

function isPgEnum(c: Column): boolean {
  return c.type instanceof EnumType;
}

function superstructType(s: string): Import {
  // Assume it's `foo@...`, turn it into `Foo@...`
  const [symbol, ...path] = s.split("@");
  return Import.from(`${pascalCase(symbol)}@${path.join("@")}`);
}

function zodSchemaType(s: string): Code {
  const schema = Import.from(s);
  return code`${Zod}.input<typeof ${schema}>`;
}

function userFieldTypeType(s: string): Import {
  return Import.from(`t:${s}`);
}

function serdeType(s: string): Import {
  return Import.from(s);
}
