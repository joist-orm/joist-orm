import { camelCase, pascalCase, snakeCase } from "change-case";
import { Column, M2MRelation, M2ORelation, O2MRelation, Table } from "pg-structure";
import { plural, singular } from "pluralize";
import { imp, Import } from "ts-poet";
import {
  Config,
  isAsyncDerived,
  isDerived,
  isFieldIgnored,
  isProtected,
  ormMaintainedFields,
  RelationConfig,
  relationName,
  superstructConfig,
} from "./config";
import { EnumMetadata, EnumRow } from "./index";
import { fail, isEnumTable, isJoinTable, mapSimpleDbTypeToTypescriptType, tableToEntityName } from "./utils";

/** Codegen-time metadata about a given domain entity. */
export type Entity = {
  name: string;
  /** The symbol pointing to the entity itself. */
  type: Import;
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
  | "numeric"
  | "text"
  | "citext"
  | "character varying"
  | "varchar"
  | "timestamp with time zone"
  | "date"
  | "jsonb";

interface Field {
  fieldName: string;
  ignore?: boolean;
}
export type PrimitiveTypescriptType = "boolean" | "string" | "number" | "Date" | "Object";

export type PrimitiveField = Field & {
  columnName: string;
  columnType: DatabaseColumnType;
  columnDefault: number | boolean | string | null;
  // The fieldType might be code for jsonb columns
  fieldType: PrimitiveTypescriptType | Import;
  rawFieldType: PrimitiveTypescriptType;
  notNull: boolean;
  derived: "orm" | "sync" | "async" | false;
  protected: boolean;
  superstruct: Import | undefined;
};

export type EnumField = Field & {
  columnName: string;
  columnDefault: number | boolean | string | null;
  enumName: string;
  enumType: Import;
  enumDetailType: Import;
  enumDetailsType: Import;
  enumRows: EnumRow[];
  notNull: boolean;
  isArray: boolean;
};

/** I.e. a `Book.author` reference pointing to an `Author`. */
export type ManyToOneField = Field & {
  columnName: string;
  otherFieldName: string;
  otherEntity: Entity;
  notNull: boolean;
};

/** I.e. a `Author.books` collection. */
export type OneToManyField = Field & {
  singularName: string;
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
  otherColumnNotNull: boolean;
};

/** I.e. a `Author.image` reference when `image.author_id` is unique. */
export type OneToOneField = Field & {
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
  otherColumnNotNull: boolean;
};

export type ManyToManyField = Field & {
  joinTableName: string;
  singularName: string;
  columnName: string;
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
};

/** I.e. a `Comment.parent` reference that groups `comments.parent_book_id` and `comments.parent_book_review_id`. */
export type PolymorphicField = Field & {
  fieldType: string; // The name of the type union, eg `CommentParent`
  notNull: boolean;
  components: PolymorphicFieldComponent[];
};

export type PolymorphicFieldComponent = {
  columnName: string; // eg `parent_book_id` or `parent_book_review_id`
  otherFieldName: string; // eg `comment` or `comments`
  otherEntity: Entity;
};

/** Adapts the generally-great pg-structure metadata into our specific ORM types. */
export class EntityDbMetadata {
  entity: Entity;
  primitives: PrimitiveField[];
  enums: EnumField[];
  manyToOnes: ManyToOneField[];
  oneToManys: OneToManyField[];
  oneToOnes: OneToOneField[];
  manyToManys: ManyToManyField[];
  polymorphics: PolymorphicField[];
  tableName: string;

  constructor(config: Config, table: Table, enums: EnumMetadata = {}) {
    this.entity = makeEntity(tableToEntityName(config, table));
    this.primitives = table.columns
      .filter((c) => !c.isPrimaryKey && !c.isForeignKey)
      .filter((c) => !isEnumArray(c))
      .map((column) => newPrimitive(config, this.entity, column, table))
      .filter((f) => !f.ignore);
    this.enums = [
      ...table.m2oRelations
        .filter((r) => isEnumTable(r.targetTable))
        .map((r) => newEnumField(config, this.entity, r, enums))
        .filter((f) => !f.ignore),
      ...table.columns
        .filter((c) => isEnumArray(c))
        .map((column) => newEnumArrayField(config, this.entity, column, enums))
        .filter((f) => !f.ignore),
    ];
    this.manyToOnes = table.m2oRelations
      .filter((r) => !isEnumTable(r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .filter((r) => !isComponentOfPolymorphicRelation(config, r))
      .map((r) => newManyToOneField(config, this.entity, r))
      .filter((f) => !f.ignore);
    this.oneToManys = table.o2mRelations
      // ManyToMany join tables also show up as OneToMany tables in pg-structure
      .filter((r) => !isJoinTable(r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .filter((r) => !isOneToOneRelation(r))
      .map((r) => newOneToMany(config, this.entity, r))
      .filter((f) => !f.ignore);
    this.oneToOnes = table.o2mRelations
      // ManyToMany join tables also show up as OneToMany tables in pg-structure
      .filter((r) => !isJoinTable(r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .filter((r) => isOneToOneRelation(r))
      .map((r) => newOneToOne(config, this.entity, r))
      .filter((f) => !f.ignore);
    this.manyToManys = table.m2mRelations
      // pg-structure is really loose on what it considers a m2m relationship, i.e. any entity
      // that has a foreign key to us, and a foreign key to something else, is automatically
      // considered as a join table/m2m between "us" and "something else". Filter these out
      // by looking for only true join tables, i.e. tables with only id, fk1, and fk2.
      .filter((r) => isJoinTable(r.joinTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .map((r) => newManyToManyField(config, this.entity, r))
      .filter((f) => !f.ignore);

    this.polymorphics = polymorphicRelations(config, table).map((rc) =>
      newPolymorphicField(config, table, this.entity, rc),
    );

    this.tableName = table.name;
  }

  get name(): string {
    return this.entity.name;
  }
}

function isMultiColumnForeignKey(r: M2ORelation | O2MRelation | M2MRelation) {
  return r.foreignKey.columns.length > 1;
}

function isOneToOneRelation(r: O2MRelation) {
  // otherColumn will be the images.book_id in the other table
  const otherColumn = r.foreignKey.columns[0];
  // r.foreignKey.index is the index on _us_ (i.e. our Book primary key), so look up indexes in the target table
  const indexes = r.targetTable.columns.find((c) => c.name == otherColumn.name)?.uniqueIndexes || [];
  // If the column is the only column in an unique index, it's a one-to-one
  return indexes.find((i) => i.columns.length === 1) !== undefined;
}

function polymorphicRelations(config: Config, table: Table) {
  const entity = config.entities[tableToEntityName(config, table)];
  return Object.entries(entity?.relations ?? {})
    .filter(([, r]) => r.polymorphic)
    .map(([name, relation]) => ({ name, ...relation }));
}

function polymorphicFieldName(config: Config, r: M2ORelation | O2MRelation) {
  const { name } = r.foreignKey.columns[0];
  const table = r instanceof M2ORelation ? r.sourceTable : r.targetTable;
  return polymorphicRelations(config, table).find((pr) => name.startsWith(`${snakeCase(pr.name)}_`))?.name;
}

function isComponentOfPolymorphicRelation(config: Config, r: M2ORelation) {
  return polymorphicFieldName(config, r) !== undefined;
}

function newPrimitive(config: Config, entity: Entity, column: Column, table: Table): PrimitiveField {
  const fieldName = primitiveFieldName(column.name);
  const columnName = column.name;
  const columnType = (column.type.shortName || column.type.name) as DatabaseColumnType;
  const fieldType = mapType(table.name, columnName, columnType);
  const superstruct = superstructConfig(config, entity, fieldName);
  const maybeUserType = fieldType === "Object" && superstruct ? superstructType(superstruct) : fieldType;
  return {
    fieldName,
    columnName,
    columnType,
    fieldType: maybeUserType,
    rawFieldType: fieldType,
    notNull: column.notNull,
    columnDefault: column.default,
    derived: fieldDerived(config, entity, fieldName),
    protected: isProtected(config, entity, fieldName),
    ignore: isFieldIgnored(config, entity, fieldName, column.notNull, column.default !== null),
    superstruct: fieldType === "Object" && superstruct ? Import.from(superstruct) : undefined,
  };
}

function fieldDerived(config: Config, entity: Entity, fieldName: string): PrimitiveField["derived"] {
  if (ormMaintainedFields.includes(fieldName)) {
    return "orm";
  } else if (isDerived(config, entity, fieldName)) {
    return "sync";
  } else if (isAsyncDerived(config, entity, fieldName)) {
    return "async";
  } else {
    return false;
  }
}

function newEnumField(config: Config, entity: Entity, r: M2ORelation, enums: EnumMetadata): EnumField {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const fieldName = enumFieldName(column.name);
  const enumName = tableToEntityName(config, r.targetTable);
  const enumType = imp(`${enumName}@./entities`);
  const enumDetailType = imp(`${plural(enumName)}@./entities`);
  const enumDetailsType = imp(`${enumName}Details@./entities`);
  const notNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName, notNull, column.default !== null);
  return {
    fieldName,
    columnName,
    columnDefault: column.default,
    enumName,
    enumType,
    enumDetailType,
    enumDetailsType,
    notNull,
    ignore,
    enumRows: enums[r.targetTable.name].rows,
    isArray: false,
  };
}

function newEnumArrayField(config: Config, entity: Entity, column: Column, enums: EnumMetadata): EnumField {
  const columnName = column.name;
  const fieldName = enumFieldName(column.name);
  // Find the enum table name via the comment hint (instead of a FK constraint), and strip the enum= prefix
  const enumTable = column.comment!.replace("enum=", "");
  const enumName = (enums[enumTable] || fail(`Could not find enum ${enumTable}`)).name;
  const enumType = imp(`${enumName}@./entities`);
  const enumDetailType = imp(`${plural(enumName)}@./entities`);
  const enumDetailsType = imp(`${enumName}Details@./entities`);
  const notNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName, notNull, column.default !== null);
  return {
    fieldName,
    columnName,
    columnDefault: column.default,
    enumName,
    enumType,
    enumDetailType,
    enumDetailsType,
    notNull,
    ignore,
    enumRows: enums[enumTable].rows,
    isArray: true,
  };
}

function newManyToOneField(config: Config, entity: Entity, r: M2ORelation): ManyToOneField {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const fieldName = referenceName(config, entity, r);
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const isOneToOne = column.uniqueIndexes.find((i) => i.columns.length === 1) !== undefined;
  const otherFieldName = isOneToOne
    ? oneToOneName(config, otherEntity, entity)
    : collectionName(config, otherEntity, entity, r).fieldName;
  const notNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName, notNull, column.default !== null);
  return { fieldName, columnName, otherEntity, otherFieldName, notNull, ignore };
}

function newOneToMany(config: Config, entity: Entity, r: O2MRelation): OneToManyField {
  const column = r.foreignKey.columns[0];
  // source == parent i.e. the reference of the foreign key column
  // target == child i.e. the table with the foreign key column in it
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const { singularName, fieldName } = collectionName(config, entity, otherEntity, r);
  const otherFieldName = referenceName(config, otherEntity, r);
  const otherColumnName = column.name;
  const otherColumnNotNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName) || isFieldIgnored(config, otherEntity, otherFieldName);
  return { fieldName, singularName, otherEntity, otherFieldName, otherColumnName, otherColumnNotNull, ignore };
}

function newOneToOne(config: Config, entity: Entity, r: O2MRelation): OneToOneField {
  const column = r.foreignKey.columns[0];
  // source == parent i.e. the reference of the foreign key column
  // target == child i.e. the table with the foreign key column in it
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const fieldName = oneToOneName(config, entity, otherEntity);
  const otherFieldName = referenceName(config, otherEntity, r);
  const otherColumnName = column.name;
  const otherColumnNotNull = column.notNull;
  const ignore = isFieldIgnored(config, entity, fieldName) || isFieldIgnored(config, otherEntity, otherFieldName);
  return { fieldName, otherEntity, otherFieldName, otherColumnName, otherColumnNotNull, ignore };
}

function newManyToManyField(config: Config, entity: Entity, r: M2MRelation): ManyToManyField {
  const { foreignKey, targetForeignKey, targetTable } = r;
  const joinTableName = r.joinTable.name;
  const otherEntity = makeEntity(tableToEntityName(config, targetTable));
  const fieldName = relationName(
    config,
    entity,
    camelCase(plural(targetForeignKey.columns[0].name.replace("_id", ""))),
  );
  const otherFieldName = relationName(
    config,
    otherEntity,
    camelCase(plural(foreignKey.columns[0].name.replace("_id", ""))),
  );
  const columnName = foreignKey.columns[0].name;
  const otherColumnName = targetForeignKey.columns[0].name;
  const singularName = singular(fieldName);
  const ignore = isFieldIgnored(config, entity, fieldName) || isFieldIgnored(config, otherEntity, otherFieldName);
  return { joinTableName, fieldName, singularName, columnName, otherEntity, otherFieldName, otherColumnName, ignore };
}

function newPolymorphicField(config: Config, table: Table, entity: Entity, rc: RelationConfig) {
  const { polymorphic, name } = rc;
  const fieldName = name!;
  const components = table.m2oRelations
    .filter((r) => !isEnumTable(r.targetTable))
    .filter((r) => !isMultiColumnForeignKey(r))
    .filter((r) => polymorphicFieldName(config, r) === fieldName)
    .map((r) => newPolymorphicFieldComponent(config, entity, r));

  return {
    fieldName,
    fieldType: `${entity.name}${pascalCase(fieldName)}`,
    notNull: polymorphic === "notNull",
    components,
  };
}

function newPolymorphicFieldComponent(config: Config, entity: Entity, r: M2ORelation): PolymorphicFieldComponent {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const otherEntity = makeEntity(tableToEntityName(config, r.targetTable));
  const isOneToOne = column.uniqueIndexes.find((i) => i.columns.length === 1) !== undefined;
  const otherFieldName = isOneToOne
    ? oneToOneName(config, otherEntity, entity)
    : collectionName(config, otherEntity, entity, r).fieldName;
  return { columnName, otherEntity, otherFieldName };
}

export function oneToOneName(config: Config, entity: Entity, otherEntity: Entity): string {
  return relationName(config, entity, camelCase(otherEntity.name));
}

export function referenceName(config: Config, entity: Entity, r: M2ORelation | O2MRelation): string {
  const column = r.foreignKey.columns[0];
  const fieldName = polymorphicFieldName(config, r) ?? camelCase(column.name.replace("_id", ""));
  return relationName(config, entity, fieldName);
}

function enumFieldName(columnName: string) {
  return camelCase(columnName.replace("_id", ""));
}

function primitiveFieldName(columnName: string) {
  return camelCase(columnName);
}

/** Returns the collection name to use on `entity` when referring to `otherEntity`s. */
export function collectionName(
  config: Config,
  entity: Entity,
  otherEntity: Entity,
  r: M2ORelation | O2MRelation,
): { fieldName: string; singularName: string } {
  // TODO Handle conflicts in names
  // I.e. if the other side is `child.project_id`, use `children`.
  let fieldName = otherEntity.name;
  // check if we have multiple FKs from otherEntity --> entity and prefix with FK name if so
  const sourceTable = r instanceof M2ORelation ? r.sourceTable : r.targetTable;
  const targetTable = r instanceof M2ORelation ? r.targetTable : r.sourceTable;
  if (sourceTable.m2oRelations.filter((r) => r.targetTable === targetTable).length > 1) {
    fieldName = `${r.foreignKey.columns[0].name.replace("_id", "")}_${fieldName}`;
  }
  // If the other side is `book_reviews.book_id`, use `reviews`.
  if (fieldName.length > entity.name.length) {
    fieldName = fieldName.replace(entity.name, "");
  }

  // camelize the name
  let singularName = camelCase(fieldName);
  fieldName = camelCase(plural(fieldName));

  // If the name is overridden, use that, but also singularize it
  const maybeOverriddenName = relationName(config, entity, fieldName);
  if (maybeOverriddenName !== fieldName) {
    singularName = singular(maybeOverriddenName);
    fieldName = maybeOverriddenName;
  }

  return { singularName, fieldName };
}

export function makeEntity(entityName: string): Entity {
  return {
    name: entityName,
    type: entityType(entityName),
    metaName: metaName(entityName),
    metaType: metaType(entityName),
    idType: imp(`${entityName}Id@./entities`, { definedIn: `./${entityName}Codegen` }),
    orderType: imp(`${entityName}Order@./entities`, { definedIn: `./${entityName}Codegen` }),
    optsType: imp(`${entityName}Opts@./entities`, { definedIn: `./${entityName}Codegen` }),
    configConst: imp(`${camelCase(entityName)}Config@./entities`, { definedIn: `./${entityName}Codegen` }),
  };
}

function metaName(entityName: string): string {
  return `${camelCase(entityName)}Meta`;
}

function metaType(entityName: string): Import {
  return imp(`${metaName(entityName)}@./entities`);
}

function entityType(entityName: string): Import {
  return imp(`${entityName}@./entities`);
}

function mapType(tableName: string, columnName: string, dbColumnType: DatabaseColumnType): PrimitiveTypescriptType {
  return mapSimpleDbTypeToTypescriptType(dbColumnType);
}

function isEnumArray(c: Column): boolean {
  return c.arrayDimension === 1 && !!c.comment && c.comment.startsWith("enum=");
}

function superstructType(s: string): Import {
  // Assume it's `foo@...`, turn it into `Foo@...`
  const [symbol, path] = s.split("@");
  return Import.from(`${pascalCase(symbol)}@${path}`);
}
