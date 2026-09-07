import { createRequire } from "node:module";

import { type InsertFixup } from "./drivers/EntityWriter.ts";
import { type Field, type PolymorphicField, type SerdeField, getBaseMeta, getMetadata } from "./EntityMetadata.ts";
import { type ExprOutputType, arrayOutputType, canonicalDbType } from "./Expr.ts";
import {
  type Entity,
  type EntityMetadata,
  getConstructorFromTaggedId,
  isDefined,
  isEntity,
  keyToNumber,
  keyToTaggedId,
  maybeResolveReferenceToId,
} from "./index.ts";
import { type RowData } from "./RowData.ts";
import { getRuntimeConfig } from "./runtimeConfig.ts";
import { type Temporal, requireTemporal } from "./temporal.ts";
import { plainDateMapper, plainDateTimeMapper, plainTimeMapper, zonedDateTimeMapper } from "./temporalMappers.ts";
import { groupBy } from "./utils.ts";

const runtimeRequire = createRequire(import.meta.url);

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
   * Reads the field's column(s) from the entity's `(rowData, rowIndex)` query result and sets
   * the domain value(s) into the `__orm.data`.
   *
   * Reading via `rowData.get(rowIndex, columnName)` (instead of a materialized POJO row) lets
   * lazy results like `WireRowData` decode only the cells that are actually accessed.
   *
   * Originally used in `EntityManager.hydrate` to set db values into the entity, although
   * now we invoke it lazily in `getField` to avoid copying data until it's actually needed.
   */
  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void;
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
  /** Physical nullability, independent of codec null/default handling. */
  sqlNullable?: boolean;
  /** Whether PostgreSQL supplies a default when this column is omitted. */
  hasDefault?: boolean;
  /** Whether PostgreSQL generates this column instead of accepting assignments. */
  isGenerated?: boolean;
  /** Internal compatibility metadata for the column's mapFromDb/mapToDb, absent for unknown codecs. */
  readonly outputType?: ExprOutputType;
  /** From the given `__orm.data` hash, return this columns value, i.e. for putting in `UPDATE` params. */
  dbValue(data: any, entity: Entity, tableName: string, fixups: InsertFixup[] | undefined): any;
  /**
   * Encodes one domain value for a write without an owning entity or FK fixups.
   *
   * Callers must handle omission/undefined, SQL NULL, and SQL expressions before encoding. This retains
   * entity-write defaults and JSON serialization, so null is not necessarily encoded as SQL NULL.
   * Direct mutation callers must validate reference target types and reject new/unflushed entities before encoding.
   */
  mapToDbValue?(value: unknown): unknown;
  /**
   * Used by `fork`, `importEntity`, and `run` to create an __orm.row from an __orm.data. Should output what we would
   * expect from a db query
   */
  rowValue(data: any): any;
  /** For a given domain value, return the database value, i.e. for putting `em.find` params into a db WHERE clause. */
  mapToDb(value: any): any;
  /** Converts one driver-level column value to its domain value, including entity null/default handling. */
  mapFromDb(value: unknown): unknown;
  /**
   * For converting `json_agg`-preloaded JSON values into *ResultSet* type.
   *
   * I.e. our `#orm.row` hash always wants the db-side value, as-is coming from the database driver.
   * During `getField`, we always expect the ResultSet value, b/c we lazy call
   * `setOnEntityFromRowData` to go from db-value to domain-value.
   *
   * So `mapFromJsonAgg` is for preloading that needs to go from json-value *only to db-value*.
   *
   * I.e. for types like temporal, which we keep as strings in `row`, the json-value will match
   * the db-value, so `mapFromJsonAgg` can be a noop. But (at one point...) `Date`s we store as
   * `Date`s in `row`, so then `mapFromJsonAgg` needs to convert string json-value value into a `Date`.
   */
  mapFromJsonAgg(value: any): any;
  isArray: boolean;
  /** Used by `unnest_arrays`. */
  isNullableArray: boolean;
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
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  columns = [this];
  isArray: boolean = false;
  isNullableArray: boolean = false;

  public constructor(
    protected fieldName: string,
    public columnName: string,
    public dbType: string,
    private mapper: CustomSerde<any, any>,
    // Allow subtypes to override isArray
    isArray?: boolean,
    isNullableArray = false, // only set for nullable arrays
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
    if (isArray !== undefined) this.isArray = isArray;
    this.isNullableArray = isNullableArray;
  }

  /** Only known adapters share their mapper's identity and elementwise array conversion. */
  get outputType(): ExprOutputType | undefined {
    if (
      this.isArray !== this.dbType.endsWith("[]") ||
      (this.constructor !== CustomSerdeAdapter &&
        this.constructor !== PlainDateSerde &&
        this.constructor !== PlainTimeSerde &&
        this.constructor !== PlainDateTimeSerde &&
        this.constructor !== ZonedDateTimeSerde)
    ) {
      return undefined;
    }
    const dbType = canonicalDbType(this.dbType);
    // A numeric mapper may require scalar text; classic pg decodes numeric[] elements as numbers.
    const elementType = this.isArray ? dbType.slice(0, -2) : dbType;
    const outputType = { dbType: elementType, domain: this.mapper, arrayElementSafe: elementType !== "numeric" };
    if (!this.isArray) return outputType;
    // Physical arrays pass null elements to the mapper, unlike scalar arrayAgg; keep their domains distinct.
    return arrayOutputType(outputType) || ["date", "time", "timestamp", "timestamptz"].includes(elementType)
      ? { dbType, domain: this.mapper }
      : undefined;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
  }

  dbValue(data: any): any {
    return this.mapToDbValue(data[this.fieldName]);
  }

  /** Encodes each physical array element once. */
  mapToDbValue(value: unknown): unknown {
    return value !== undefined
      ? this.isArray
        ? (value as readonly unknown[]).map((element) => this.mapper.toDb(element))
        : this.mapper.toDb(value)
      : undefined;
  }

  rowValue(data: any): any {
    return this.dbValue(data);
  }

  mapToDb(value: any): any {
    return value === null
      ? value
      : this.isArray
        ? value.map((element: unknown) => this.mapper.toDb(element))
        : this.mapper.toDb(value);
  }

  /** Converts a driver value with the custom mapper, including array elements. */
  mapFromDb(value: unknown): unknown {
    const dbValue = maybeNullToUndefined(value);
    return dbValue !== undefined
      ? this.isArray
        ? dbValue.map((value: unknown) => this.mapper.fromDb(value))
        : this.mapper.fromDb(dbValue)
      : undefined;
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
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  columns = [this];

  constructor(
    protected fieldName: string,
    public columnName: string,
    public dbType: string,
    public isArray = false,
    public isNullableArray = false, // only set for nullable arrays
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
  }

  /** Exact-class checks prevent an unknown subclass's overridden converters from sharing this codec. */
  get outputType(): ExprOutputType | undefined {
    if (this.constructor !== PrimitiveSerde) return undefined;
    const dbType = canonicalDbType(this.dbType);
    const elementType = dbType.endsWith("[]") ? dbType.slice(0, -2) : dbType;
    if (this.isArray !== dbType.endsWith("[]")) return undefined;
    const outputType = {
      dbType: elementType,
      domain: primitiveOutputDomain(elementType),
      arrayElementSafe: elementType !== "numeric",
    };
    return this.isArray ? arrayOutputType(outputType) : outputType;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
  }

  dbValue(data: any) {
    return this.mapToDbValue(data[this.fieldName]);
  }

  /** Primitive writes share their scalar/filter conversion, including subclass overrides. */
  mapToDbValue(value: unknown): unknown {
    return this.mapToDb(value);
  }

  rowValue(data: any): any {
    return this.dbValue(data);
  }

  mapToDb(value: any) {
    return value;
  }

  /** Keeps driver values as-is, with SQL NULL represented as an unset entity field. */
  mapFromDb(value: unknown): unknown {
    return maybeNullToUndefined(value);
  }

  mapFromJsonAgg(value: any): any {
    return value;
  }
}

export class DateSerde extends PrimitiveSerde implements TimestampSerde<Date> {
  /** Date bindings use ISO strings; mapToDb does not support physical Date arrays. */
  get outputType(): ExprOutputType | undefined {
    return this.constructor === DateSerde && !this.isArray && !this.dbType.endsWith("[]")
      ? { dbType: canonicalDbType(this.dbType), domain: DateSerde }
      : undefined;
  }

  /** Accept the caller's date as-is. */
  mapFromNow(now: Date): Date {
    return now;
  }

  mapFromJsonAgg(value: any): any {
    if (value === null) return value;
    return new Date(value);
  }

  /**
   * Returns the `Date` a driver hands back on a read, and not `mapToDb`'s ISO string.
   *
   * Otherwise callers that round-trip a row through `rowValue` and back through `setOnEntity` (i.e.
   * `RunPlugin` mirroring writes into the test em) turn every date into a string, because our
   * `setOnEntity` assigns the row value as-is.
   */
  rowValue(data: any): any {
    return data[this.fieldName];
  }

  mapToDb(value: Date) {
    // bun.sql needs this, node-pg does it out of the box
    return value?.toISOString();
  }
}

/** Converts `DATE`s `Temporal.PlainDate`s. */
export class PlainDateSerde extends CustomSerdeAdapter {
  constructor(
    fieldName: string,
    columnName: string,
    dbType: string,
    isArray = false,
    isNullableArray = false,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    super(fieldName, columnName, dbType, plainDateMapper, isArray, isNullableArray, column);
  }
}

/** Converts `TIME`s to `Temporal.PlainTime`s. */
export class PlainTimeSerde extends CustomSerdeAdapter {
  constructor(
    fieldName: string,
    columnName: string,
    dbType: string,
    isArray = false,
    isNullableArray = false,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    super(fieldName, columnName, dbType, plainTimeMapper, isArray, isNullableArray, column);
  }
}

/** Converts `TIMESTAMP`s to `Temporal.PlainDateTime`s. */
export class PlainDateTimeSerde extends CustomSerdeAdapter implements TimestampSerde<Temporal.PlainDateTime> {
  constructor(
    fieldName: string,
    columnName: string,
    dbType: string,
    isArray = false,
    isNullableArray = false,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    super(fieldName, columnName, dbType, plainDateTimeMapper, isArray, isNullableArray, column);
  }

  mapFromNow(now: Date): Temporal.PlainDateTime {
    const { timeZone } = getRuntimeConfig().temporal as any;
    return requireTemporal().toTemporalInstant.call(now).toZonedDateTimeISO(timeZone).toPlainDateTime();
  }
}

/** Converts `TIMESTAMP WITH TIME ZONE`s to `Temporal.ZonedDateTime`s. */
export class ZonedDateTimeSerde extends CustomSerdeAdapter implements TimestampSerde<Temporal.ZonedDateTime> {
  constructor(
    fieldName: string,
    columnName: string,
    dbType: string,
    isArray = false,
    isNullableArray = false,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    super(fieldName, columnName, dbType, zonedDateTimeMapper, isArray, isNullableArray, column);
  }

  mapFromNow(now: Date): Temporal.ZonedDateTime {
    const { timeZone } = getRuntimeConfig().temporal as any;
    return requireTemporal().toTemporalInstant.call(now).toZonedDateTimeISO(timeZone);
  }
}

export class BigIntSerde implements FieldSerde {
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  columns = [this];
  dbType: string;

  constructor(
    private fieldName: string,
    public columnName: string,
    public isArray = false,
    public isNullableArray = false,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.dbType = isArray ? "bigint[]" : "bigint";
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
  }

  /** BigInt conversion is distinct from both the driver's int8 value and Number aggregates. */
  get outputType(): ExprOutputType | undefined {
    if (this.constructor !== BigIntSerde) return undefined;
    const elementType = { dbType: "int8", domain: BigIntSerde, arrayElementSafe: true };
    return this.isArray ? arrayOutputType(elementType) : elementType;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
  }

  dbValue(data: any) {
    return this.mapToDbValue(data[this.fieldName]);
  }

  /** Drivers accept native bigint values without conversion. */
  mapToDbValue(value: unknown): unknown {
    if (this.isArray) assertFlatNumericArray(value);
    return value;
  }

  rowValue(data: any): any {
    return this.dbValue(data);
  }

  mapToDb(value: any) {
    return value;
  }

  /** Converts the driver's bigint representation to the entity value. */
  mapFromDb(value: unknown): unknown {
    const dbValue = maybeNullToUndefined(value);
    if (this.isArray && dbValue !== undefined) {
      assertFlatNumericArray(dbValue);
      return dbValue.map((element: string | bigint | number | null) => (element === null ? null : BigInt(element)));
    }
    return dbValue ? BigInt(dbValue) : dbValue;
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : this.isArray ? this.mapFromDb(value) : BigInt(value);
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
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  dbType: string;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    public isArray = false,
    public isNullableArray = false,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.dbType = isArray ? "numeric[]" : "decimal";
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
  }

  /** Numeric aggregates use the same Number conversion and identity binding encoder. */
  get outputType(): ExprOutputType | undefined {
    if (this.constructor !== DecimalToNumberSerde) return undefined;
    const elementType = { dbType: "numeric", domain: Number, arrayElementSafe: true };
    return this.isArray ? arrayOutputType(elementType) : elementType;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
  }

  dbValue(data: any) {
    return this.mapToDbValue(data[this.fieldName]);
  }

  /** Drivers accept decimal numbers without conversion. */
  mapToDbValue(value: unknown): unknown {
    if (this.isArray) assertFlatNumericArray(value);
    return value;
  }

  rowValue(data: any): any {
    return this.dbValue(data);
  }

  mapToDb(value: any) {
    return value;
  }

  /** Converts a driver decimal value to a JavaScript number. */
  mapFromDb(value: unknown): unknown {
    const dbValue = maybeNullToUndefined(value);
    if (this.isArray && dbValue !== undefined) {
      assertFlatNumericArray(dbValue);
      return dbValue.map((element: string | number | null) => (element === null ? null : Number(element)));
    }
    return dbValue !== undefined ? Number(dbValue) : dbValue;
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : this.isArray ? this.mapFromDb(value) : Number(value);
  }
}

/** Maps physical integer keys to logical string IDs "because GraphQL". */
export class KeySerde implements FieldSerde {
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  isArray = false;
  isNullableArray = false;
  columns = [this];
  private meta: {
    tagName: string;
    idDbType: "bigint" | "int" | "uuid" | "text";
  };

  constructor(
    tagName: string,
    private fieldName: string,
    public columnName: string,
    public dbType: "bigint" | "int" | "uuid" | "text",
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
    this.meta = {
      tagName,
      idDbType: dbType,
    };
  }

  /** PKs and FKs share a tag and SQL representation; the alias supplies the exact target idMeta. */
  get outputType(): ExprOutputType | undefined {
    return this.constructor === KeySerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: `key:${this.meta.tagName}`, arrayElementSafe: true }
      : undefined;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
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
        value: this.mapToDbValue(maybeResolveReferenceToId(value)),
      });
      return null;
    }
    return this.mapToDbValue(maybeResolveReferenceToId(value));
  }

  /** Resolves references and tagged, untagged, or numeric ids using the column's tag and storage type. */
  mapToDbValue(value: unknown): unknown {
    return keyToNumber(
      this.meta,
      typeof value === "number"
        ? value
        : maybeResolveReferenceToId(value as Parameters<typeof maybeResolveReferenceToId>[0]),
    );
  }

  rowValue(data: any): any {
    // we don't have any fixups since we are trying to recreate what comes out of the db, so this is safe
    return this.dbValue(data, undefined!, undefined!, undefined);
  }

  mapToDb(value: any) {
    // Sometimes the nilIdValue will pass -1 as already a number, but usually this should be a tagged id
    if (value === null || typeof value === "number") return value;
    // We go through `maybeResolveReferenceToId` because filters like `in: [a1, a2]` pass entities directly.
    return keyToNumber(this.meta, maybeResolveReferenceToId(value));
  }

  /** Converts a physical primary or foreign key to a tagged id. */
  mapFromDb(value: unknown): string | undefined {
    return keyToTaggedId(this.meta, value as string | number);
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

export class PolymorphicKeySerde implements FieldSerde {
  constructor(
    private meta: () => EntityMetadata,
    private fieldName: string,
    // Physical descriptors must keep their original components after domain specialization.
    private storageColumn?: string,
  ) {}

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    for (const column of this.columns) {
      const value = rowData.get(rowIndex, column.columnName);
      if (value) data[this.fieldName] ??= column.mapFromDb(value);
    }
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
      isNullableArray: false,
      otherMetadata: comp.otherMetadata,
      dbValue(data: any): any {
        return this.mapToDbValue(data[fieldName]);
      },
      /** Encodes only references belonging to this physical component, preserving subtype selection. */
      mapToDbValue(value: unknown): unknown {
        const id = maybeResolveReferenceToId(value as Parameters<typeof maybeResolveReferenceToId>[0]);
        const cstr = isEntity(value) ? getMetadata(value).cstr : id ? getConstructorFromTaggedId(id) : undefined;
        // We'll have multiple columns, i.e. [parent_author_id, parent_book_id], and each column
        // will only return a value if the `id` matches its type, i.e. `parent_author_id=a:1` will
        // return 1, but `parent_book_id` will return null.
        const otherMeta = comp.otherMetadata();
        const idAppliesToThisColumn = hasMultipleComponentsWithSameBaseType
          ? cstr === otherMeta.cstr
          : cstr === otherMeta.cstr ||
            cstr === getBaseMeta(otherMeta).cstr ||
            otherMeta.subTypes.some((subTypeMeta) => cstr === subTypeMeta.cstr);
        return idAppliesToThisColumn ? keyToNumber(comp.otherMetadata(), id) : undefined;
      },
      mapToDb(value: any): any {
        return keyToNumber(comp.otherMetadata(), typeof value === "number" ? value : maybeResolveReferenceToId(value));
      },
      /** Converts this component's foreign key to its target entity's tagged id. */
      mapFromDb(value: unknown): string | undefined {
        return keyToTaggedId(comp.otherMetadata(), value as string | number);
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
    const meta = this.meta();
    return (
      this.storageColumn ? meta.columns[this.storageColumn].field : meta.fields[this.fieldName]
    ) as PolymorphicField;
  }
}

export class EnumFieldSerde implements FieldSerde {
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  isArray = false;
  isNullableArray = false;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    public dbType: "int" | "uuid",
    private enumObject: any,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
  }

  /** Separate fields of the same generated enum share its code/id mapping. */
  get outputType(): ExprOutputType | undefined {
    return this.constructor === EnumFieldSerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: this.enumObject, arrayElementSafe: true }
      : undefined;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
  }

  dbValue(data: any) {
    return this.mapToDbValue(data[this.fieldName]);
  }

  /** Resolves the enum code to its stored id, leaving an unknown code unset. */
  mapToDbValue(value: unknown): unknown {
    return this.enumObject.findByCode(value)?.id;
  }

  rowValue(data: any): any {
    return this.dbValue(data);
  }

  mapToDb(value: any) {
    return this.enumObject.findByCode(value)?.id;
  }

  /** Converts a stored enum id to its enum code. */
  mapFromDb(value: unknown): unknown {
    return this.enumObject.findById(value)?.code;
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

export class EnumArrayFieldSerde implements FieldSerde {
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  isArray = true;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    public dbType: "int[]" | "uuid[]",
    public isNullableArray: boolean,
    private enumObject: any,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
  }

  /** Physical enum arrays reject null elements, unlike scalar enum arrayAgg; leave them unknown. */
  get outputType(): undefined {
    return undefined;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
  }

  dbValue(data: any) {
    return this.mapToDbValue(data[this.fieldName]);
  }

  /** Resolves each enum code to its stored id, retaining the entity's empty-array default. */
  mapToDbValue(value: unknown): unknown {
    return (value as readonly unknown[] | null | undefined)?.map((code) => this.enumObject.getByCode(code).id) || [];
  }

  rowValue(data: any): any {
    return this.dbValue(data);
  }

  mapToDb(value: any) {
    return !value ? [] : value.map((code: any) => this.enumObject.getByCode(code).id);
  }

  /** Converts stored enum ids to codes, defaulting an unset entity field to an empty array. */
  mapFromDb(value: unknown): unknown[] {
    return (value as readonly unknown[] | null | undefined)?.map((id) => this.enumObject.findById(id).code) || [];
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

/** Similar to SimpleSerde, but applies the superstruct `assert` function when reading values from the db. */
export class SuperstructSerde implements FieldSerde {
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  dbType = "jsonb";
  isArray = false;
  isNullableArray = false;
  columns = [this];

  // Use a dynamic require so that downstream projects don't have to depend on superstruct
  // until they want to, i.e. we don't have superstruct in the joist-orm package.json.
  private assert = runtimeRequire("superstruct").assert;

  constructor(
    private fieldName: string,
    public columnName: string,
    private superstruct: any,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
  }

  /** JSON schemas describe a jsonb value, even when that value is a JSON array. */
  get outputType(): ExprOutputType | undefined {
    return this.constructor === SuperstructSerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: this.superstruct, arrayElementSafe: true }
      : undefined;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
  }

  dbValue(data: any) {
    return this.mapToDbValue(data[this.fieldName]);
  }

  /** Serializes the domain JSON value without running the read-time schema validation. */
  mapToDbValue(value: unknown): unknown {
    return JSON.stringify(value);
  }

  // JSON is returned by postgres already parsed, so we should just be able to return our data directly. Unlike with
  // JsonSerde, we can assume that superstruct would have parsed any complex types in the json correctly so we don't
  // need to do a round trip through JSON.stringify.
  rowValue(data: any): any {
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return JSON.stringify(value);
  }

  /** Validates a driver JSON value with the field's Superstruct schema. */
  mapFromDb(value: unknown): unknown {
    const dbValue = maybeNullToUndefined(value);
    if (dbValue) this.assert(dbValue, this.superstruct);
    return dbValue;
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

export class JsonSerde implements FieldSerde {
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  dbType = "jsonb";
  isArray = false;
  isNullableArray = false;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
  }

  /** Unvalidated JSON uses its own encoder, not a primitive or schema-specific codec. */
  get outputType(): ExprOutputType | undefined {
    return this.constructor === JsonSerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: JsonSerde, arrayElementSafe: true }
      : undefined;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
  }

  dbValue(data: any) {
    return this.mapToDbValue(data[this.fieldName]);
  }

  /** Serializes the whole JSON value, including JSON arrays and custom toJSON methods. */
  mapToDbValue(value: unknown): unknown {
    return JSON.stringify(value);
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

  /** Keeps the driver's parsed JSON value, normalizing SQL NULL for entity fields. */
  mapFromDb(value: unknown): unknown {
    return maybeNullToUndefined(value);
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

/** Similar to SimpleSerde, but applies the zod's `parse` function when reading values from the db. */
export class ZodSerde implements FieldSerde {
  sqlNullable?: boolean;
  hasDefault?: boolean;
  isGenerated?: boolean;
  dbType = "jsonb";
  isArray = false;
  isNullableArray = false;
  columns = [this];

  constructor(
    private fieldName: string,
    public columnName: string,
    private zodSchema: any,
    column?: Pick<Column, "sqlNullable" | "hasDefault" | "isGenerated">,
  ) {
    this.sqlNullable = column?.sqlNullable;
    this.hasDefault = column?.hasDefault;
    this.isGenerated = column?.isGenerated;
  }

  /** Parsing and transformations are compatible only for the same schema object. */
  get outputType(): ExprOutputType | undefined {
    return this.constructor === ZodSerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: this.zodSchema, arrayElementSafe: true }
      : undefined;
  }

  setOnEntityFromRowData(data: any, rowData: RowData, rowIndex: number): void {
    data[this.fieldName] = this.mapFromDb(rowData.get(rowIndex, this.columnName));
  }

  dbValue(data: any) {
    // assume the data is already valid b/c it came from the entity
    return this.mapToDbValue(data[this.fieldName]);
  }

  /** Serializes the domain JSON value without running the read-time Zod parser or transforms. */
  mapToDbValue(value: unknown): unknown {
    return JSON.stringify(value);
  }

  // JSON is returned by postgres already parsed, so we should just be able to return our data directly. Unlike with
  // JsonSerde, we can assume that zod would have parsed any complex types in the json correctly so we don't need to
  // do a round trip through JSON.stringify.
  rowValue(data: any): any {
    return data[this.fieldName];
  }

  mapToDb(value: any) {
    return JSON.stringify(value);
  }

  /** Parses a driver JSON value with the field's Zod schema. */
  mapFromDb(value: unknown): unknown {
    const dbValue = maybeNullToUndefined(value);
    return dbValue ? this.zodSchema.parse(dbValue) : dbValue;
  }

  mapFromJsonAgg(value: any): any {
    return value === null ? value : value;
  }
}

/** PostgreSQL does not enforce declared array dimensions; reject nested values rather than coercing subarrays. */
function assertFlatNumericArray(value: unknown): void {
  if (Array.isArray(value) && value.some(Array.isArray)) {
    throw new Error("Native numeric arrays must be one-dimensional");
  }
}

/** Only driver-native numbers agree with Number aggregates; int8/numeric identity values do not. */
function primitiveOutputDomain(dbType: string): unknown {
  switch (dbType) {
    case "int2":
    case "int4":
    case "float4":
    case "float8":
      return Number;
    case "text":
    case "varchar":
    case "bpchar":
      return String;
    default:
      return PrimitiveSerde;
  }
}

/** Normalizes SQL NULL to an unset entity field. */
function maybeNullToUndefined(value: any): any {
  return value === null ? undefined : value;
}
