import { camelCase } from "change-case";
import { Table, M2ORelation, M2MRelation, O2MRelation, Column } from "pg-structure";
import pluralize from "pluralize";
import { imp } from "ts-poet";
import { SymbolSpec } from "ts-poet/build/SymbolSpecs";
import { ColumnMetaData } from "./generateEntityCodegenFile";
import { isEnumTable, isJoinTable, mapSimpleDbType, tableToEntityName } from "./utils";

// TODO Populate from config
const columnCustomizations: Record<string, ColumnMetaData> = {};

/** Codegen-time metadata about a given domain entity. */
type Entity = {
  name: string;
  /** The symbol pointing to the entity itself. */
  type: SymbolSpec;
  /** The name of the entity's runtime metadata const. */
  metaName: string;
  /** The symbol pointing to the entity's runtime metadata const. */
  metaType: SymbolSpec;
  /** The symbol pointing to the entity's EntityId type. */
  idType: SymbolSpec;
  /** The symbol pointing to the entity's Order type. */
  orderType: SymbolSpec;
};

type PrimitiveField = {
  fieldName: string;
  columnName: string;
  columnType: string;
  fieldType: string | SymbolSpec;
  notNull: boolean;
};

type EnumField = {
  fieldName: string;
  columnName: string;
  enumName: string;
  enumType: SymbolSpec;
  enumDetailType: SymbolSpec;
  notNull: boolean;
};

type ManyToOneField = {
  fieldName: string;
  columnName: string;
  otherFieldName: string;
  otherEntity: Entity;
  notNull: boolean;
};

type OneToManyField = {
  fieldName: string;
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
};

type ManyToManyField = {
  joinTableName: string;
  fieldName: string;
  columnName: string;
  otherEntity: Entity;
  otherFieldName: string;
  otherColumnName: string;
};

/** Adapts the generally-great pg-structure metadata into our specific ORM types. */
export class EntityDbMetadata {
  entity: Entity;
  primitives: PrimitiveField[];
  enums: EnumField[];
  manyToOnes: ManyToOneField[];
  oneToManys: OneToManyField[];
  manyToManys: ManyToManyField[];

  constructor(table: Table) {
    this.entity = makeEntity(tableToEntityName(table));
    this.primitives = table.columns
      .filter((c) => !c.isPrimaryKey && !c.isForeignKey)
      .map((column) => newPrimitive(column, table));
    this.enums = table.m2oRelations.filter((r) => isEnumTable(r.targetTable)).map((r) => newEnumField(r));
    this.manyToOnes = table.m2oRelations
      .filter((r) => !isEnumTable(r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .map((r) => newManyToOneField(this.entity, r));
    this.oneToManys = table.o2mRelations
      // ManyToMany join tables also show up as OneToMany tables in pg-structure
      .filter((r) => !isJoinTable(r.targetTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .map((r) => newOneToMany(this.entity, r));
    this.manyToManys = table.m2mRelations
      // pg-structure is really loose on what it considers a m2m relationship, i.e. any entity
      // that has a foreign key to us, and a foreign key to something else, is automatically
      // considered as a join table/m2m between "us" and "something else". Filter these out
      // by looking for only true join tables, i.e. tables with only id, fk1, and fk2.
      .filter((r) => isJoinTable(r.joinTable))
      .filter((r) => !isMultiColumnForeignKey(r))
      .map((r) => newManyToManyField(r));
  }
}

function isMultiColumnForeignKey(r: M2ORelation) {
  return r.foreignKey.columns.length > 1;
}

function newPrimitive(column: Column, table: Table): PrimitiveField {
  const fieldName = camelCase(column.name);
  const columnName = column.name;
  const columnType = column.type.shortName || column.type.name;
  const maybeCustomType = mapType(table.name, columnName, columnType);
  const fieldType = maybeCustomType.fieldType;
  const notNull = column.notNull;
  return { fieldName, columnName, columnType, fieldType, notNull };
}

function newEnumField(r: M2ORelation): EnumField {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const fieldName = camelCase(column.name.replace("_id", ""));
  const enumName = tableToEntityName(r.targetTable);
  const enumType = imp(`${enumName}@./entities`);
  const enumDetailType = imp(`${pluralize(enumName)}@./entities`);
  const notNull = column.notNull;
  return { fieldName, columnName, enumName, enumType, enumDetailType, notNull };
}

function newManyToOneField(entity: Entity, r: M2ORelation): ManyToOneField {
  const column = r.foreignKey.columns[0];
  const columnName = column.name;
  const fieldName = camelCase(column.name.replace("_id", ""));
  const otherEntity = makeEntity(tableToEntityName(r.targetTable));
  const otherFieldName = collectionName(otherEntity, entity);
  const notNull = column.notNull;
  return { fieldName, columnName, otherEntity, otherFieldName, notNull };
}

function newOneToMany(entity: Entity, r: O2MRelation): OneToManyField {
  const column = r.foreignKey.columns[0];
  // source == parent i.e. the reference of the foreign key column
  // target == child i.e. the table with the foreign key column in it
  const otherEntity = makeEntity(tableToEntityName(r.targetTable));
  const fieldName = collectionName(entity, otherEntity);
  const otherFieldName = camelCase(column.name.replace("_id", ""));
  const otherColumnName = column.name;
  return { fieldName, otherEntity, otherFieldName, otherColumnName };
}

/** Returns the collection name to use on `entity` when referring to `otherEntity`s. */
export function collectionName(entity: Entity, otherEntity: Entity): string {
  // TODO Handle multiple fks from otherEntity --> entity
  // TODO Handle conflicts in names
  // I.e. if the other side is `child.project_id`, use `children`.
  let fieldName = otherEntity.name;
  // If the other side is `book_reviews.book_id`, use `reviews`.
  if (fieldName.length > entity.name.length) {
    fieldName = fieldName.replace(entity.name, "");
  }
  return camelCase(pluralize(fieldName));
}

function newManyToManyField(r: M2MRelation): ManyToManyField {
  const { foreignKey, targetForeignKey, targetTable } = r;
  const joinTableName = r.joinTable.name;
  const otherEntity = makeEntity(tableToEntityName(targetTable));
  const fieldName = camelCase(pluralize(targetForeignKey.columns[0].name.replace("_id", "")));
  const otherFieldName = camelCase(pluralize(foreignKey.columns[0].name.replace("_id", "")));
  const columnName = foreignKey.columns[0].name;
  const otherColumnName = targetForeignKey.columns[0].name;
  return { joinTableName, fieldName, columnName, otherEntity, otherFieldName, otherColumnName };
}

export function makeEntity(entityName: string): Entity {
  return {
    name: entityName,
    type: entityType(entityName),
    metaName: metaName(entityName),
    metaType: metaType(entityName),
    idType: imp(`${entityName}Id@./entities`, { definedIn: `./${entityName}Codegen` }),
    orderType: imp(`${entityName}Order@./entities`, { definedIn: `./${entityName}Codegen` }),
  };
}

function metaName(entityName: string): string {
  return `${camelCase(entityName)}Meta`;
}

function metaType(entityName: string): SymbolSpec {
  return imp(`${metaName(entityName)}@./entities`);
}

function entityType(entityName: string): SymbolSpec {
  return imp(`${entityName}@./entities`);
}

function mapType(tableName: string, columnName: string, dbColumnType: string): ColumnMetaData {
  return (
    columnCustomizations[`${tableName}.${columnName}`] || {
      fieldType: mapSimpleDbType(dbColumnType),
    }
  );
}
