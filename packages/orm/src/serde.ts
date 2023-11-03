import { Field, PolymorphicField, SerdeField } from "./EntityMetadata";
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

/**
 * The database/column serialization / deserialization details of a given field.
 *
 * Most implementations will have just a single column in `columns`, but some logical
 * domain fields can be mapped to multiple physical database columns, i.e. polymorphic
 * references.
 */
export interface FieldSerde {
  /** A single field might persist to multiple columns, i.e. polymorphic references. */
  columns: Column[];

  /**
   * Accepts a database `row` and sets the field's value(s) into the `__orm.data`.
   *
   * Used in EntityManager.hydrate to set row value on the entity
   */
  setOnEntity(data: any, row: any): void;
}

/** A specific physical column of a logical field. */
export interface Column {
  columnName: string;
  dbType: string;
  /** From the given `__orm.data` hash, return this columns value, i.e. for putting in `UPDATE` params. */
  dbValue(data: any): any;
  /** For a given domain value, return the database value, i.e. for putting `em.find` params into a db WHERE clause. */
  mapToDb(value: any): any;
  /** For converting `json_agg`-preloaded JSON values into their domain type. */
  mapFromJsonAgg(value: any): any;
  isArray: boolean;
}

export interface CustomSerde<DomainType, DbType> {
  toDb(value: DomainType): DbType;
  fromDb(value: DbType): DomainType;
}

export class CustomSerdeAdapter implements FieldSerde {
  columns = [this];

  isArray: boolean = false;

  public constructor(
    protected fieldName: string,
    public columnName: string,
    public dbType: string,
    private mapper: CustomSerde<any, any>,
  ) {}
  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.columnName]);
    data[this.fieldName] = value !== undefined ? this.mapper.fromDb(value) : undefined;
  }

  dbValue(data: any): any {
    const fieldData = data[this.fieldName];
    return fieldData !== undefined ? this.mapper.toDb(data[this.fieldName]) : undefined;
  }

  mapToDb(value: any): any {
    return value === null ? value : this.mapper.fromDb(value);
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : this.mapper.fromDb(value);
  }
}

/** Supports `string`, `int`, etc., as well as `string[]`, `int[]`, etc. */
export class PrimitiveSerde implements FieldSerde {
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    public dbType: string,
    public isArray = false,
  ) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = maybeNullToUndefined(row[this.columnName]);
  }

  dbValue(data: any) {
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }

  mapFromJsonAgg(value: any): any {
    if (value === null) return value;
    // Super-hacky handling of de-JSON-ifying dates
    if (this.dbType.includes("time") || this.dbType.includes("date")) return new Date(value);
    return value;
  }
}

export class BigIntSerde implements FieldSerde {
  isArray = false;
  columns = [this];
  dbType = "bigint";

  constructor(
    private fieldName: string,
    public columnName: string,
  ) {}

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.columnName]);
    data[this.fieldName] = value ? BigInt(value) : value;
  }

  dbValue(data: any) {
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return value;
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : BigInt(value);
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
export class DecimalToNumberSerde implements FieldSerde {
  dbType = "decimal";
  isArray = false;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
  ) {}

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

  mapFromJsonAgg(value: any): any {
    return value === null ? value : Number(value);
  }
}

/** Maps physical integer keys to logical string IDs "because GraphQL". */
export class KeySerde implements FieldSerde {
  isArray = false;
  columns = [this];
  private meta: { tagName: string; idType: "int" | "uuid" };

  constructor(
    tagName: string,
    private fieldName: string,
    public columnName: string,
    public dbType: "int" | "uuid",
  ) {
    this.meta = { tagName, idType: dbType };
  }

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = keyToString(this.meta, row[this.columnName]);
  }

  dbValue(data: any) {
    return keyToNumber(this.meta, maybeResolveReferenceToId(data[this.fieldName]));
  }

  mapToDb(value: any) {
    return value === null ? value : keyToNumber(this.meta, maybeResolveReferenceToId(value));
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

export class PolymorphicKeySerde implements FieldSerde {
  constructor(
    private meta: () => EntityMetadata<any>,
    private fieldName: string,
  ) {}

  setOnEntity(data: any, row: any): void {
    this.columns
      .filter((column) => !!row[column.columnName])
      .forEach((column) => {
        data[this.fieldName] ??= keyToString(column.otherMetadata(), row[column.columnName]);
      });
  }

  // Lazy b/c we use PolymorphicField which we can't access in our cstr
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
      mapFromJsonAgg(value: any): any {
        return value === null ? value : value;
      },
    }));
  }

  get columnName(): string {
    throw new Error("Unsupported");
  }

  // Lazy b/c we use PolymorphicField which we can't access in our cstr
  private get field(): PolymorphicField {
    return this.meta().fields[this.fieldName] as PolymorphicField;
  }
}

export class EnumFieldSerde implements FieldSerde {
  dbType = "int";
  isArray = false;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    private enumObject: any,
  ) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = this.enumObject.findById(row[this.columnName])?.code;
  }

  dbValue(data: any) {
    return this.enumObject.findByCode(data[this.fieldName])?.id;
  }

  mapToDb(value: any) {
    return this.enumObject.findByCode(value)?.id;
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

export class EnumArrayFieldSerde implements FieldSerde {
  dbType = "int[]";
  isArray = true;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    private enumObject: any,
  ) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = row[this.columnName]?.map((id: any) => this.enumObject.findById(id).code) || [];
  }

  dbValue(data: any) {
    return data[this.fieldName]?.map((code: any) => this.enumObject.getByCode(code).id) || [];
  }

  mapToDb(value: any) {
    return !value ? [] : value.map((code: any) => this.enumObject.getByCode(code).id);
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

function maybeNullToUndefined(value: any): any {
  return value === null ? undefined : value;
}

/** Similar to SimpleSerde, but applies the superstruct `assert` function when reading values from the db. */
export class SuperstructSerde implements FieldSerde {
  dbType = "jsonb";
  isArray = false;
  columns = [this];

  // Use a dynamic require so that downstream projects don't have to depend on superstruct
  // until they want to, i.e. we don't have superstruct in the joist-orm package.json.
  private assert = require("superstruct").assert;

  constructor(
    private fieldName: string,
    public columnName: string,
    private superstruct: any,
  ) {}

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.columnName]);
    if (value) {
      this.assert(value, this.superstruct);
    }
    data[this.fieldName] = value;
  }

  dbValue(data: any) {
    return JSON.stringify(data[this.fieldName]);
  }

  mapToDb(value: any) {
    return JSON.stringify(value);
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

export class JsonSerde implements FieldSerde {
  dbType = "jsonb";
  isArray = false;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
  ) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = maybeNullToUndefined(row[this.columnName]);
  }

  dbValue(data: any) {
    return JSON.stringify(data[this.fieldName]);
  }

  mapToDb(value: any) {
    return JSON.stringify(value);
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

/** Similar to SimpleSerde, but applies the zod's `parse` function when reading values from the db. */
export class ZodSerde implements FieldSerde {
  dbType = "jsonb";
  isArray = false;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    private zodSchema: any,
  ) {}

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.columnName]);
    if (value) {
      data[this.fieldName] = this.zodSchema.parse(value);
    } else {
      data[this.fieldName] = value;
    }
  }

  dbValue(data: any) {
    // assume the data is already valid b/c it came from the entity
    return JSON.stringify(data[this.fieldName]);
  }

  mapToDb(value: any) {
    return JSON.stringify(value);
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}
