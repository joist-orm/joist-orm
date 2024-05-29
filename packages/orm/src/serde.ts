import type { Temporal } from "temporal-polyfill";
import { Field, PolymorphicField, SerdeField, getBaseMeta, getMetadata } from "./EntityMetadata";
import { InsertFixup } from "./drivers/EntityWriter";
import {
  Entity,
  EntityMetadata,
  getConstructorFromTaggedId,
  isDefined,
  isEntity,
  keyToNumber,
  keyToTaggedId,
  maybeResolveReferenceToId,
} from "./index";
import { groupBy, requireTemporal } from "./utils";

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

export interface TimestampSerde<T> extends FieldSerde {
  mapFromInstant(value: Temporal.Instant): T;
  mapFromDate(value: Date): T;
  dbValue(data: any): any;
}

/** A specific physical column of a logical field. */
export interface Column {
  columnName: string;
  dbType: string;
  /** From the given `__orm.data` hash, return this columns value, i.e. for putting in `UPDATE` params. */
  dbValue(data: any, entity: Entity, tableName: string, fixups: InsertFixup[] | undefined): any;
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
    return value === null ? value : this.mapper.toDb(value);
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
    return value;
  }
}

export class DateSerde extends PrimitiveSerde implements TimestampSerde<Date> {
  mapFromInstant(value: Temporal.Instant): Date {
    return new Date(value.epochMilliseconds);
  }

  mapFromJsonAgg(value: any): any {
    if (value === null) return value;
    return new Date(value);
  }

  mapFromDate(value: Date) {
    return value;
  }
}

abstract class TemporalSerde<T> implements FieldSerde {
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    public dbType: string,
    public timeZone: string,
    public isArray = false,
  ) {}

  abstract toTemporal(value: Date): T;

  abstract fromTemporal(value: T): Date;

  private maybeToTemporal(value: any): any {
    return isDefined(value) && value instanceof Date ? this.toTemporal(value) : value;
  }

  private maybeFromTemporal(value: any): any {
    return isDefined(value) && !(value instanceof Date) ? this.fromTemporal(value) : value;
  }

  setOnEntity(data: any, row: any) {
    let value = maybeNullToUndefined(row[this.columnName]);
    if (this.isArray) {
      if (Array.isArray(value)) value = value.map((v) => this.maybeToTemporal(v));
    } else {
      value = this.maybeToTemporal(value);
    }
    data[this.fieldName] = value;
  }

  dbValue(data: any) {
    return this.mapToDb(data[this.fieldName]);
  }

  mapToDb(value: any) {
    if (this.isArray) {
      return Array.isArray(value) ? value.map((v) => this.maybeFromTemporal(v)) : value;
    } else {
      return this.maybeFromTemporal(value);
    }
  }

  mapFromJsonAgg(value: any): any {
    if (this.isArray) {
      return Array.isArray(value) ? value.map((v) => this.toTemporal(new Date(v))) : value;
    } else {
      return isDefined(value) ? this.toTemporal(new Date(value)) : value;
    }
  }
}

export class PlainDateSerde extends TemporalSerde<Temporal.PlainDate> {
  fromTemporal(value: Temporal.PlainDate): Date {
    return new Date(value.toZonedDateTime(this.timeZone).epochMilliseconds);
  }

  toTemporal(value: Date): Temporal.PlainDate {
    return requireTemporal().toTemporalInstant.call(value).toZonedDateTimeISO(this.timeZone).toPlainDate();
  }
}

export class PlainDateTimeSerde extends TemporalSerde<Temporal.PlainDateTime> {
  fromTemporal(value: Temporal.PlainDateTime): Date {
    return new Date(value.toZonedDateTime(this.timeZone).epochMilliseconds);
  }

  toTemporal(value: Date): Temporal.PlainDateTime {
    return requireTemporal().toTemporalInstant.call(value).toZonedDateTimeISO(this.timeZone).toPlainDateTime();
  }
}

export class ZonedDateTimeSerde
  extends TemporalSerde<Temporal.ZonedDateTime>
  implements TimestampSerde<Temporal.ZonedDateTime>
{
  fromTemporal(value: Temporal.ZonedDateTime) {
    return new Date(value.epochMilliseconds);
  }

  toTemporal(value: Date) {
    return requireTemporal().toTemporalInstant.call(value).toZonedDateTimeISO(this.timeZone);
  }

  mapFromInstant(value: Temporal.Instant) {
    return value.toZonedDateTimeISO(this.timeZone);
  }

  mapFromDate(value: Date) {
    return this.toTemporal(value);
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
  private meta: { tagName: string; idDbType: "bigint" | "int" | "uuid" };

  constructor(
    tagName: string,
    private fieldName: string,
    public columnName: string,
    public dbType: "bigint" | "int" | "uuid",
  ) {
    this.meta = { tagName, idDbType: dbType };
  }

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = keyToTaggedId(this.meta, row[this.columnName]);
  }

  dbValue(data: any, entity: Entity, tableName: string, fixups: InsertFixup[] | undefined) {
    const value = data[this.fieldName];
    if (
      fixups &&
      isEntity(value) &&
      value.isNewEntity &&
      getMetadata(value).nonDeferredFkOrder &&
      getMetadata(entity).nonDeferredFkOrder &&
      getMetadata(value).nonDeferredFkOrder! >= getMetadata(entity).nonDeferredFkOrder!
    ) {
      fixups.push({
        entity,
        tableName,
        column: this,
        value: keyToNumber(this.meta, maybeResolveReferenceToId(value)),
      });
      return null;
    }
    return keyToNumber(this.meta, maybeResolveReferenceToId(value));
  }

  mapToDb(value: any) {
    // Sometimes the nilIdValue will pass -1 as already a number, but usually this should be a tagged id
    return value === null || typeof value === "number"
      ? value
      : // We go through `maybeResolveReferenceToId` because filters like `in: [a1, a2]` will pass the
        // entity directly into mapToDb and not convert it to a tagged id first.
        keyToNumber(this.meta, maybeResolveReferenceToId(value));
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

export class PolymorphicKeySerde implements FieldSerde {
  constructor(
    private meta: () => EntityMetadata,
    private fieldName: string,
  ) {}

  setOnEntity(data: any, row: any): void {
    this.columns
      .filter((column) => !!row[column.columnName])
      .forEach((column) => {
        data[this.fieldName] ??= keyToTaggedId(column.otherMetadata(), row[column.columnName]);
      });
  }

  // Lazy b/c we use PolymorphicField which we can't access in our cstr
  get columns(): Array<Column & { otherMetadata: () => EntityMetadata }> {
    const { fieldName } = this;

    // If our poly has multiple components from the same base type, i.e.
    // `parent_small_publisher_id` and `parent_large_publisher_id`, then we
    // need slightly different logic...
    const hasMultipleComponentsWithSameBaseType = [
      ...groupBy(this.field.components, (comp) => getBaseMeta(comp.otherMetadata()).type).values(),
    ].some((group) => group.length > 1);

    return this.field.components.map((comp) => ({
      columnName: comp.columnName,
      dbType: "int",
      isArray: false,
      otherMetadata: comp.otherMetadata,
      dbValue(data: any): any {
        const id = maybeResolveReferenceToId(data[fieldName]);
        const cstr = id ? getConstructorFromTaggedId(id) : undefined;
        // We'll have multiple columns, i.e. [parent_author_id, parent_book_id], and each column
        // will only return a value if the `id` matches its type, i.e. `parent_author_id=a:1` will
        // return 1, but `parent_book_id` will return null.
        const idAppliesToThisColumn = hasMultipleComponentsWithSameBaseType
          ? cstr === comp.otherMetadata().cstr
          : cstr === getBaseMeta(comp.otherMetadata()).cstr;
        return idAppliesToThisColumn ? keyToNumber(comp.otherMetadata(), id) : undefined;
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
  isArray = false;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    public dbType: "int" | "uuid",
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
  isArray = true;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    public dbType: "int[]" | "uuid[]",
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
