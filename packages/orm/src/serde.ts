import { Field, PolymorphicField, SerdeField } from "./EntityManager";
import {
  EntityMetadata,
  getConstructorFromTaggedId,
  keyToNumber,
  keyToString,
  maybeResolveReferenceToId,
} from "./index";

export function hasSerde(field: Field): field is SerdeField {
  return !!field.serde;
}

// TODO Rename to FieldSerde
export interface ColumnSerde {
  /** A single field might persist to multiple columns, i.e. polymorphic references. */
  columns: Column[];

  // Used in EntityManager.hydrate to set row value on the entity
  setOnEntity(data: any, row: any): void;
}

export interface Column {
  columnName: string;
  dbType: string;
  dbValue(data: any): any;
  mapToDb(value: any): any;
  isArray: boolean;
}

export class SimpleSerde implements ColumnSerde {
  isArray = false;
  columns = [this];

  constructor(private fieldName: string, public columnName: string, public dbType: string) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = maybeNullToUndefined(row[this.columnName]);
  }

  dbValue(data: any) {
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }
}

/**
 * Maps `decimal(...)` database types to the JS `number`.
 *
 * Note that we assume the db values are within the range of the JS `number`;
 * we should eventually sanity check that.
 *
 * Also note that knex/pg accept `number`s as input, so we only need
 * to handle from-database -> to JS translation.
 */
export class DecimalToNumberSerde implements ColumnSerde {
  dbType = "decimal";
  isArray = false;
  columns = [this];

  constructor(private fieldName: string, public columnName: string) {}

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.columnName]);
    data[this.fieldName] = value !== undefined ? Number(value) : value;
  }

  dbValue(data: any) {
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }
}

/** Maps integer primary keys ot strings "because GraphQL". */
export class PrimaryKeySerde implements ColumnSerde {
  dbType = "int";
  isArray = false;
  columns = [this];

  constructor(private meta: () => EntityMetadata<any>, private fieldName: string, public columnName: string) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = keyToString(this.meta(), row[this.columnName]);
  }

  dbValue(data: any) {
    return keyToNumber(this.meta(), data[this.fieldName]);
  }

  mapToDb(value: any) {
    return keyToNumber(this.meta(), maybeResolveReferenceToId(value));
  }
}

export class ForeignKeySerde implements ColumnSerde {
  dbType = "int";
  isArray = false;
  columns = [this];

  // TODO EntityMetadata being in here is weird.
  constructor(private fieldName: string, public columnName: string, public otherMeta: () => EntityMetadata<any>) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = keyToString(this.otherMeta(), row[this.columnName]);
  }

  dbValue(data: any) {
    return keyToNumber(this.otherMeta(), maybeResolveReferenceToId(data[this.fieldName]));
  }

  mapToDb(value: any): any {
    return keyToNumber(this.otherMeta(), maybeResolveReferenceToId(value));
  }
}

export class PolymorphicKeySerde implements ColumnSerde {
  // TODO EntityMetadata being in here is weird.  Don't think it is avoidable though.
  constructor(private meta: () => EntityMetadata<any>, private fieldName: string) {}

  setOnEntity(data: any, row: any): void {
    this.field.components.forEach((comp) => {
      if (!!row[comp.columnName]) {
        data[this.fieldName] ??= keyToString(comp.otherMetadata(), row[comp.columnName]);
        return;
      }
    });
  }

  // Lazy
  get columns(): Array<Column & { otherMetadata: () => EntityMetadata<any> }> {
    const { fieldName } = this;
    return this.field.components.map((comp) => ({
      columnName: comp.columnName,
      dbType: "int",
      isArray: false,
      otherMetadata: comp.otherMetadata,
      dbValue(data: any): any {
        const id = maybeResolveReferenceToId(data[fieldName]);
        const cstr = id ? getConstructorFromTaggedId(id) : undefined;
        return cstr === comp.otherMetadata().cstr ? keyToNumber(comp.otherMetadata(), id) : undefined;
      },
      mapToDb(value: any): any {
        return keyToNumber(comp.otherMetadata(), maybeResolveReferenceToId(value));
      },
    }));
  }

  get columnName(): string {
    throw new Error("Unsupported");
  }

  // Lazy look this up b/c meta() won't work immediately during the constructor
  private get field(): PolymorphicField {
    return this.meta().fields[this.fieldName] as PolymorphicField;
  }
}

export class EnumFieldSerde implements ColumnSerde {
  dbType = "int";
  isArray = false;
  columns = [this];

  constructor(private fieldName: string, public columnName: string, private enumObject: any) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = this.enumObject.findById(row[this.columnName])?.code;
  }

  dbValue(data: any) {
    return this.enumObject.findByCode(data[this.fieldName])?.id;
  }

  mapToDb(value: any) {
    return this.enumObject.findByCode(value)?.id;
  }
}

export class EnumArrayFieldSerde implements ColumnSerde {
  dbType = "int[]";
  isArray = true;
  columns = [this];

  constructor(private fieldName: string, public columnName: string, private enumObject: any) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = row[this.columnName]?.map((id: any) => this.enumObject.findById(id).code) || [];
  }

  dbValue(data: any) {
    return data[this.fieldName]?.map((code: any) => this.enumObject.getByCode(code).id) || [];
  }

  mapToDb(value: any) {
    return !value ? [] : value.map((code: any) => this.enumObject.getByCode(code).id);
  }
}

function maybeNullToUndefined(value: any): any {
  return value === null ? undefined : value;
}

/** Similar to SimpleSerde, but applies the superstruct `assert` function when reading values from the db. */
export class SuperstructSerde implements ColumnSerde {
  dbType = "jsonb";
  isArray = false;
  columns = [this];

  // Use a dynamic require so that downstream projects don't have to depend on superstruct
  // until they want to, i.e. we don't have superstruct in the joist-orm package.json.
  private assert = require("superstruct").assert;

  constructor(private fieldName: string, public columnName: string, private superstruct: any) {}

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.columnName]);
    if (value) {
      this.assert(value, this.superstruct);
    }
    data[this.fieldName] = value;
  }

  dbValue(data: any) {
    // assume the data is already valid b/c it came from the entity
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }
}
