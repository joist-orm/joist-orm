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
import { getRuntimeConfig } from "./runtimeConfig";
import { requireTemporal } from "./temporal";
import { plainDateMapper, plainDateTimeMapper, plainTimeMapper, zonedDateTimeMapper } from "./temporalMappers";
import { groupBy } from "./utils";

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
   * Accepts the database `row` and sets the field's value(s) into the `__orm.data`.
   *
   * Originally used in `EntityManager.hydrate` to set db values into the entity, although
   * now we invoke it lazily in `getField` to avoid copying data until it's actually needed.
   */
  setOnEntity(data: any, row: any): void;
}

/**
 * An interface that generalizes our Date-vs-Temporal support.
 *
 * @typeParam T - The domain type, i.e. `Date` or `Temporal.ZonedDateTime`.
 */
export interface TimestampSerde<T> extends FieldSerde {
  /** Given business logic that wants to "set this value to 'now'", converts its Date to our T. */
  mapFromNow(now: Date): T;
  /** Used for reading oplock values. */
  dbValue(data: any): any;
}

/** A specific physical column of a logical field. */
export interface Column {
  columnName: string;
  dbType: string;
  /** From the given `__orm.data` hash, return this columns value, i.e. for putting in `UPDATE` params. */
  dbValue(data: any, entity: Entity, tableName: string, fixups: InsertFixup[] | undefined): any;
  /**
   * Used by `fork`, `importEntity`, and `run` to create an __orm.row from an __orm.data. Should output what we would
   * expect from a db query
   */
  rowValue(data: any): any;
  /** For a given domain value, return the database value, i.e. for putting `em.find` params into a db WHERE clause. */
  mapToDb(value: any): any;
  /**
   * For converting `json_agg`-preloaded JSON values into *ResultSet* type.
   *
   * I.e. our `#orm.row` hash always wants the db-side value, as-is coming from the database driver.
   * During `getField`, we always expect the ResultSet value, b/c we lazy call `setOnEntity` to go
   * from db-value to domain-value.
   *
   * So `mapFromJsonAgg` is for preloading that needs to go from json-value *only to db-value*.
   *
   * I.e. for types like temporal, which we keep as strings in `row`, the json-value will match
   * the db-value, so `mapFromJsonAgg` can be a noop. But (at one point...) `Date`s we store as
   * `Date`s in `row`, so then `mapFromJsonAgg` needs to convert string json-value value into a `Date`.
   */
  mapFromJsonAgg(value: any): any;
  isArray: boolean;
}

/**
 * Provides a simplified, public API for mapping between db/domain values.
 *
 * Joist's internal `FieldSerde` API is admittedly a little crufty, and so this
 * API is intended to be a simpler, more user-friendly way to define custom types.
 */
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
    // Allow subtypes to override isArray
    isArray?: boolean,
  ) {
    if (isArray !== undefined) this.isArray = isArray;
  }

  setOnEntity(data: any, row: any): void {
    const value = maybeNullToUndefined(row[this.columnName]);
    data[this.fieldName] =
      value !== undefined
        ? this.isArray
          ? value.map((value: any) => this.mapper.fromDb(value))
          : this.mapper.fromDb(value)
        : undefined;
  }

  dbValue(data: any): any {
    const fieldData = data[this.fieldName];
    return fieldData !== undefined
      ? this.isArray
        ? fieldData.map((value: any) => this.mapper.toDb(value))
        : this.mapper.toDb(fieldData)
      : undefined;
  }

  rowValue(data: any): any {
    return this.dbValue(data);
  }

  mapToDb(value: any): any {
    return value === null ? value : this.mapper.toDb(value);
  }

  mapFromJsonAgg(value: any): any {
    // Assume the database JSON value matches the ResultSet value
    return value;
    // return value === null
    //   ? value
    //   : this.isArray
    //     ? value.map((value: any) => this.mapper.fromDb(value))
    //     : this.mapper.fromDb(value);
  }
}

/**
 * Supports `string`, `int`, etc., as well as `string[]`, `int[]`, etc.
 *
 * This is not generally meant for subclassing, because it assumes things like
 * `string[]`s can be mapped 1:1. See `CustomSerdeAdapter` a good base class
 * that will handle converting individual elements.
 */
export class PrimitiveSerde implements FieldSerde {
  columns = [this];

  constructor(
    protected fieldName: string,
    public columnName: string,
    public dbType: string,
    public isArray = false,
    public isNullableArray = false, // only set for nullable arrays
  ) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = maybeNullToUndefined(row[this.columnName]);
  }

  dbValue(data: any) {
    return this.mapToDb(data[this.fieldName]);
  }

  rowValue(data: any): any {
    return this.dbValue(data);
  }

  mapToDb(value: any) {
    return value;
  }

  mapFromJsonAgg(value: any): any {
    return value;
  }
}

export class DateSerde extends PrimitiveSerde implements TimestampSerde<Date> {
  /** Accept the caller's date as-is. */
  mapFromNow(now: Date): Date {
    return now;
  }

  mapFromJsonAgg(value: any): any {
    if (value === null) return value;
    return new Date(value);
  }

  mapToDb(value: Date) {
    // bun.sql needs this, node-pg does it out of the box
    return value?.toISOString();
  }
}

/** Converts `DATE`s `Temporal.PlainDate`s. */
export class PlainDateSerde extends CustomSerdeAdapter {
  constructor(fieldName: string, columnName: string, dbType: string, isArray = false) {
    super(fieldName, columnName, dbType, plainDateMapper, isArray);
  }
}

/** Converts `TIME`s to `Temporal.PlainTime`s. */
export class PlainTimeSerde extends CustomSerdeAdapter {
  constructor(fieldName: string, columnName: string, dbType: string, isArray = false) {
    super(fieldName, columnName, dbType, plainTimeMapper, isArray);
  }
}

/** Converts `TIMESTAMP`s to `Temporal.PlainDateTime`s. */
export class PlainDateTimeSerde extends CustomSerdeAdapter implements TimestampSerde<Temporal.PlainDateTime> {
  constructor(fieldName: string, columnName: string, dbType: string, isArray = false) {
    super(fieldName, columnName, dbType, plainDateTimeMapper, isArray);
  }

  mapFromNow(now: Date): Temporal.PlainDateTime {
    const { timeZone } = getRuntimeConfig().temporal as any;
    return requireTemporal().toTemporalInstant.call(now).toZonedDateTimeISO(timeZone).toPlainDateTime();
  }
}

/** Converts `TIMESTAMP WITH TIME ZONE`s to `Temporal.ZonedDateTime`s. */
export class ZonedDateTimeSerde extends CustomSerdeAdapter implements TimestampSerde<Temporal.ZonedDateTime> {
  constructor(fieldName: string, columnName: string, dbType: string, isArray = false) {
    super(fieldName, columnName, dbType, zonedDateTimeMapper, isArray);
  }

  mapFromNow(now: Date): Temporal.ZonedDateTime {
    const { timeZone } = getRuntimeConfig().temporal as any;
    return requireTemporal().toTemporalInstant.call(now).toZonedDateTimeISO(timeZone);
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

  rowValue(data: any): any {
    return this.dbValue(data);
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

  rowValue(data: any): any {
    return this.dbValue(data);
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
  private meta: { tagName: string; idDbType: "bigint" | "int" | "uuid" | "text" };

  constructor(
    tagName: string,
    private fieldName: string,
    public columnName: string,
    public dbType: "bigint" | "int" | "uuid" | "text",
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

  rowValue(data: any): any {
    // we don't have any fixups since we are trying to recreate what comes out of the db, so this is safe
    return this.dbValue(data, undefined!, undefined!, undefined);
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
      dbType: comp.otherMetadata().idDbType,
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
      rowValue(data: any): any {
        return this.dbValue(data);
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

  rowValue(data: any): any {
    return this.dbValue(data);
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
    public isNullableArray: boolean,
    private enumObject: any,
  ) {}

  setOnEntity(data: any, row: any): void {
    data[this.fieldName] = row[this.columnName]?.map((id: any) => this.enumObject.findById(id).code) || [];
  }

  dbValue(data: any) {
    return data[this.fieldName]?.map((code: any) => this.enumObject.getByCode(code).id) || [];
  }

  rowValue(data: any): any {
    return this.dbValue(data);
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
    return data[this.fieldName]; // postgres.js will JSON.stringify
  }

  // JSON is returned by postgres already parsed, so we should just be able to return our data directly. Unlike with
  // JsonSerde, we can assume that superstruct would have parsed any complex types in the json correctly so we don't
  // need to do a round trip through JSON.stringify.
  rowValue(data: any): any {
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return value; // postgres.js will JSON.stringify
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

  // JSON is returned by postgres already parsed, so if we are trying to recreate then we need to stringify, then parse.
  // It's necessary to do this instead of just returning the object directly because any complex types in the json need
  // to be stringified to correctly reflect the db value.
  rowValue(data: any): any {
    const json = JSON.stringify(data[this.fieldName]);
    return isDefined(json) ? JSON.parse(json) : undefined;
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
    return data[this.fieldName]; // postgres.js will JSON.stringify
  }

  // JSON is returned by postgres already parsed, so we should just be able to return our data directly. Unlike with
  // JsonSerde, we can assume that zod would have parsed any complex types in the json correctly so we don't need to
  // do a round trip through JSON.stringify.
  rowValue(data: any): any {
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return value; // postgres.js will JSON.stringify
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}
