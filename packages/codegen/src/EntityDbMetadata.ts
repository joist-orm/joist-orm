import { SymbolSpec } from "ts-poet/build/SymbolSpecs";
import { Table } from "pg-structure";
import { camelCase } from "change-case";
import { isEnumTable, isJoinTable, tableToEntityName } from "./utils";
import { imp } from "ts-poet";
import pluralize from "pluralize";

type PrimitiveColumn = { fieldName: string; columnName: string; columnType: string; notNull: boolean };
type EnumColumn = {
  fieldName: string;
  columnName: string;
  enumName: string;
  enumType: SymbolSpec;
  enumDetailType: SymbolSpec;
  notNull: boolean;
};
type ManyToOneColumn = {
  fieldName: string;
  columnName: string;
  otherFieldName: string;
  otherEntity: string;
  notNull: boolean;
};
type OneToManyColumn = { fieldName: string; otherEntity: string; otherFieldName: string; otherColumnName: string };
type ManyToManyColumn = {
  joinTableName: string;
  fieldName: string;
  columnName: string;
  otherEntity: string;
  otherFieldName: string;
  otherColumnName: string;
};

/** Adapts the generally-great pg-structure metadata into our specific ORM types. */
export class EntityDbMetadata {
  entityName: string;
  primitives: PrimitiveColumn[];
  enums: EnumColumn[];
  manyToOnes: ManyToOneColumn[];
  oneToManys: OneToManyColumn[];
  manyToManys: ManyToManyColumn[];

  constructor(table: Table) {
    this.entityName = tableToEntityName(table);

    this.primitives = table.columns
      .filter(c => !c.isPrimaryKey && !c.isForeignKey)
      .map(column => ({
        fieldName: camelCase(column.name),
        columnName: column.name,
        columnType: column.type.shortName || column.type.name,
        notNull: column.notNull,
      }));
    this.manyToOnes = table.m2oRelations
      .filter(r => !isEnumTable(r.targetTable))
      .map(r => {
        const column = r.foreignKey.columns[0];
        const columnName = column.name;
        const fieldName = camelCase(column.name.replace("_id", ""));
        const otherEntity = tableToEntityName(r.targetTable);
        const otherFieldName = camelCase(pluralize(this.entityName));
        const notNull = column.notNull;
        return { fieldName, columnName, otherEntity, otherFieldName, notNull };
      });
    this.enums = table.m2oRelations
      .filter(r => isEnumTable(r.targetTable))
      .map(r => {
        const column = r.foreignKey.columns[0];
        const columnName = column.name;
        const fieldName = camelCase(column.name.replace("_id", ""));
        const enumName = tableToEntityName(r.targetTable);
        const enumType = imp(`${enumName}@./entities`);
        const enumDetailType = imp(`${pluralize(enumName)}@./entities`);
        const notNull = column.notNull;
        return { fieldName, columnName, enumName, enumType, enumDetailType, notNull };
      });
    // Add OneToMany
    this.oneToManys = table.o2mRelations
      // ManyToMany join tables also show up as OneToMany tables in pg-structure
      .filter(r => !isJoinTable(r.targetTable))
      .map(r => {
        const column = r.foreignKey.columns[0];
        // source == parent i.e. the reference of the foreign key column
        // target == child i.e. the table with the foreign key column in it
        const otherEntity = tableToEntityName(r.targetTable);
        // I.e. if the other side is `child.project_id`, use children
        const fieldName = camelCase(pluralize(otherEntity));
        const otherFieldName = camelCase(column.name.replace("_id", ""));
        const otherColumnName = column.name;
        return { fieldName, otherEntity, otherFieldName, otherColumnName };
      });
    this.manyToManys = table.m2mRelations
      // pg-structure is really loose on what it considers a m2m relationship, i.e. any entity
      // that has a foreign key to us, and a foreign key to something else, is automatically
      // considered as a join table/m2m between "us" and "something else". Filter these out
      // by looking for only true join tables, i.e. tables with only id, fk1, and fk2.
      .filter(r => isJoinTable(r.joinTable))
      .map(r => {
        const { foreignKey, targetForeignKey, targetTable } = r;
        const joinTableName = r.joinTable.name;
        const otherEntity = tableToEntityName(targetTable);
        const fieldName = camelCase(pluralize(targetForeignKey.columns[0].name.replace("_id", "")));
        const otherFieldName = camelCase(pluralize(foreignKey.columns[0].name.replace("_id", "")));
        const columnName = foreignKey.columns[0].name;
        const otherColumnName = targetForeignKey.columns[0].name;
        return { joinTableName, fieldName, columnName, otherEntity, otherFieldName, otherColumnName };
      });
  }
}

export function metaName(entityName: string): string {
  return `${camelCase(entityName)}Meta`;
}

export function metaType(entityName: string): SymbolSpec {
  return imp(`${metaName(entityName)}@./entities`);
}

export function entityType(entityName: string): SymbolSpec {
  return imp(`${entityName}@./entities`);
}
