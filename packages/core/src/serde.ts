import { createRequire } from "node:module";

import { isDefined, keyToNumber, keyToTaggedId, maybeResolveReferenceToId } from "./index.ts";
import { getRuntimeConfig } from "./runtimeConfig.ts";
import { type Temporal, requireTemporal } from "./temporal.ts";
import { plainDateMapper, plainDateTimeMapper, plainTimeMapper, zonedDateTimeMapper } from "./temporalMappers.ts";
import { type TypeInfo, arrayOutputType, canonicalDbType } from "./TypeInfo.ts";

const runtimeRequire = createRequire(import.meta.url);

/** Scalar conversion only: no field names, entity hydration, or FK fixups. */
export interface ScalarCodec {
  dbType: string;
  isArray: boolean;
  /** Compatibility evidence for scalar conversion, absent for unknown codecs. */
  readonly outputType?: TypeInfo;
  /** Encodes a domain value for a filter, i.e. an em.find WHERE parameter. */
  mapToDb(value: any): any;
  /**
   * Encodes a domain value for an INSERT or UPDATE binding.
   *
   * Callers must handle omission, SQL NULL, and SQL expressions before encoding. JSON null and
   * codec defaults can differ from SQL NULL. Direct mutations must validate reference targets
   * and reject new or unflushed entities before encoding.
   */
  mapToDbValue?(value: unknown): unknown;
  /** Converts a driver value to its domain value, including the codec's null/default handling. */
  mapFromDb(value: unknown): unknown;
  /**
   * Converts a json_agg cell to a driver-row value, not a domain value.
   *
   * Lazy field hydration subsequently calls mapFromDb. I.e. Date codecs reconstruct a Date
   * from the JSON string, while Temporal codecs retain the driver's string representation.
   */
  mapFromJsonAgg(value: any): any;
  /** Reconstructs a driver value from a domain value, not a SQL binding. */
  mapToRow(value: any): any;
}

/** Converts the ORM clock to the timestamp's domain representation. */
export interface TimestampCodec<T> extends ScalarCodec {
  mapFromNow(now: Date): T;
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

export class CustomSerdeAdapter implements ScalarCodec {
  isArray: boolean = false;

  constructor(
    public dbType: string,
    private mapper: CustomSerde<any, any>,
    isArray?: boolean,
  ) {
    if (isArray !== undefined) this.isArray = isArray;
  }

  /** Only known adapters share their mapper's identity and elementwise array conversion. */
  get outputType(): TypeInfo | undefined {
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

  /** Encodes each physical array element once. */
  mapToDbValue(value: unknown): unknown {
    return value !== undefined
      ? this.isArray
        ? (value as readonly unknown[]).map((element) => this.mapper.toDb(element))
        : this.mapper.toDb(value)
      : undefined;
  }

  mapToRow(value: any): any {
    return this.mapToDbValue(value);
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
export class PrimitiveSerde implements ScalarCodec {
  constructor(
    public dbType: string,
    public isArray = false,
  ) {}

  /** Exact-class checks prevent an unknown subclass's overridden converters from sharing this codec. */
  get outputType(): TypeInfo | undefined {
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

  /** Primitive writes share their scalar/filter conversion, including subclass overrides. */
  mapToDbValue(value: unknown): unknown {
    return this.mapToDb(value);
  }

  mapToRow(value: any): any {
    return this.mapToDbValue(value);
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

export class DateSerde extends PrimitiveSerde implements TimestampCodec<Date> {
  /** Date bindings use ISO strings; mapToDb does not support physical Date arrays. */
  get outputType(): TypeInfo | undefined {
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
   * Otherwise callers that round-trip a row through `rowValue` and back through `fromRow` (i.e.
   * `RunPlugin` mirroring writes into the test em) turn every date into a string, because our
   * `mapFromDb` returns the row value as-is.
   */
  mapToRow(value: any): any {
    return value;
  }

  mapToDb(value: Date) {
    // bun.sql needs this, node-pg does it out of the box
    return value?.toISOString();
  }
}

/** Converts `DATE`s `Temporal.PlainDate`s. */
export class PlainDateSerde extends CustomSerdeAdapter {
  constructor(dbType: string, isArray = false) {
    super(dbType, plainDateMapper, isArray);
  }
}

/** Converts `TIME`s to `Temporal.PlainTime`s. */
export class PlainTimeSerde extends CustomSerdeAdapter {
  constructor(dbType: string, isArray = false) {
    super(dbType, plainTimeMapper, isArray);
  }
}

/** Converts `TIMESTAMP`s to `Temporal.PlainDateTime`s. */
export class PlainDateTimeSerde extends CustomSerdeAdapter implements TimestampCodec<Temporal.PlainDateTime> {
  constructor(dbType: string, isArray = false) {
    super(dbType, plainDateTimeMapper, isArray);
  }

  mapFromNow(now: Date): Temporal.PlainDateTime {
    const { timeZone } = getRuntimeConfig().temporal as any;
    return requireTemporal().toTemporalInstant.call(now).toZonedDateTimeISO(timeZone).toPlainDateTime();
  }
}

/** Converts `TIMESTAMP WITH TIME ZONE`s to `Temporal.ZonedDateTime`s. */
export class ZonedDateTimeSerde extends CustomSerdeAdapter implements TimestampCodec<Temporal.ZonedDateTime> {
  constructor(dbType: string, isArray = false) {
    super(dbType, zonedDateTimeMapper, isArray);
  }

  mapFromNow(now: Date): Temporal.ZonedDateTime {
    const { timeZone } = getRuntimeConfig().temporal as any;
    return requireTemporal().toTemporalInstant.call(now).toZonedDateTimeISO(timeZone);
  }
}

export class BigIntSerde implements ScalarCodec {
  dbType: string;

  constructor(public isArray = false) {
    this.dbType = isArray ? "bigint[]" : "bigint";
  }

  /** BigInt conversion is distinct from both the driver's int8 value and Number aggregates. */
  get outputType(): TypeInfo | undefined {
    if (this.constructor !== BigIntSerde) return undefined;
    const elementType = { dbType: "int8", domain: BigIntSerde, arrayElementSafe: true };
    return this.isArray ? arrayOutputType(elementType) : elementType;
  }

  /** Drivers accept native bigint values without conversion. */
  mapToDbValue(value: unknown): unknown {
    if (this.isArray) assertFlatNumericArray(value);
    return value;
  }

  mapToRow(value: any): any {
    return this.mapToDbValue(value);
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
export class DecimalToNumberSerde implements ScalarCodec {
  dbType: string;

  constructor(public isArray = false) {
    this.dbType = isArray ? "numeric[]" : "decimal";
  }

  /** Numeric aggregates use the same Number conversion and identity binding encoder. */
  get outputType(): TypeInfo | undefined {
    if (this.constructor !== DecimalToNumberSerde) return undefined;
    const elementType = { dbType: "numeric", domain: Number, arrayElementSafe: true };
    return this.isArray ? arrayOutputType(elementType) : elementType;
  }

  /** Drivers accept decimal numbers without conversion. */
  mapToDbValue(value: unknown): unknown {
    if (this.isArray) assertFlatNumericArray(value);
    return value;
  }

  mapToRow(value: any): any {
    return this.mapToDbValue(value);
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
export class KeySerde implements ScalarCodec {
  isArray = false;

  private meta: {
    tagName: string;
    idDbType: "bigint" | "int" | "uuid" | "text";
  };

  constructor(
    tagName: string,
    public dbType: "bigint" | "int" | "uuid" | "text",
  ) {
    this.meta = {
      tagName,
      idDbType: dbType,
    };
  }

  /** PKs and FKs share a tag and SQL representation; the alias supplies the exact target idMeta. */
  get outputType(): TypeInfo | undefined {
    return this.constructor === KeySerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: `key:${this.meta.tagName}`, arrayElementSafe: true }
      : undefined;
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

  mapToRow(value: any): any {
    // we don't have any fixups since we are trying to recreate what comes out of the db, so this is safe
    return this.mapToDbValue(value);
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

export class EnumFieldSerde implements ScalarCodec {
  isArray = false;

  constructor(
    public dbType: "int" | "uuid",
    private enumObject: any,
  ) {}

  /** Separate fields of the same generated enum share its code/id mapping. */
  get outputType(): TypeInfo | undefined {
    return this.constructor === EnumFieldSerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: this.enumObject, arrayElementSafe: true }
      : undefined;
  }

  /** Resolves the enum code to its stored id, leaving an unknown code unset. */
  mapToDbValue(value: unknown): unknown {
    return this.enumObject.findByCode(value)?.id;
  }

  mapToRow(value: any): any {
    return this.mapToDbValue(value);
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

export class EnumArrayFieldSerde implements ScalarCodec {
  isArray = true;

  constructor(
    public dbType: "int[]" | "uuid[]",
    private enumObject: any,
  ) {}

  /** Physical enum arrays reject null elements, unlike scalar enum arrayAgg; leave them unknown. */
  get outputType(): undefined {
    return undefined;
  }

  /** Resolves each enum code to its stored id, retaining the entity's empty-array default. */
  mapToDbValue(value: unknown): unknown {
    return (value as readonly unknown[] | null | undefined)?.map((code) => this.enumObject.getByCode(code).id) || [];
  }

  mapToRow(value: any): any {
    return this.mapToDbValue(value);
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
export class SuperstructSerde implements ScalarCodec {
  dbType = "jsonb";
  isArray = false;

  // Use a dynamic require so that downstream projects don't have to depend on superstruct
  // until they want to, i.e. we don't have superstruct in the joist-orm package.json.
  private assert = runtimeRequire("superstruct").assert;

  constructor(private superstruct: any) {}

  /** JSON schemas describe a jsonb value, even when that value is a JSON array. */
  get outputType(): TypeInfo | undefined {
    return this.constructor === SuperstructSerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: this.superstruct, arrayElementSafe: true }
      : undefined;
  }

  /** Serializes the domain JSON value without running the read-time schema validation. */
  mapToDbValue(value: unknown): unknown {
    return JSON.stringify(value);
  }

  // JSON is returned by postgres already parsed, so we should just be able to return our data directly. Unlike with
  // JsonSerde, we can assume that superstruct would have parsed any complex types in the json correctly so we don't
  // need to do a round trip through JSON.stringify.
  mapToRow(value: any): any {
    return value;
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

export class JsonSerde implements ScalarCodec {
  dbType = "jsonb";
  isArray = false;

  constructor() {}

  /** Unvalidated JSON uses its own encoder, not a primitive or schema-specific codec. */
  get outputType(): TypeInfo | undefined {
    return this.constructor === JsonSerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: JsonSerde, arrayElementSafe: true }
      : undefined;
  }

  /** Serializes the whole JSON value, including JSON arrays and custom toJSON methods. */
  mapToDbValue(value: unknown): unknown {
    return JSON.stringify(value);
  }

  // JSON is returned by postgres already parsed, so if we are trying to recreate then we need to stringify, then parse.
  // It's necessary to do this instead of just returning the object directly because any complex types in the json need
  // to be stringified to correctly reflect the db value.
  mapToRow(value: any): any {
    const json = JSON.stringify(value);
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
export class ZodSerde implements ScalarCodec {
  dbType = "jsonb";
  isArray = false;

  constructor(private zodSchema: any) {}

  /** Parsing and transformations are compatible only for the same schema object. */
  get outputType(): TypeInfo | undefined {
    return this.constructor === ZodSerde && !this.isArray
      ? { dbType: canonicalDbType(this.dbType), domain: this.zodSchema, arrayElementSafe: true }
      : undefined;
  }

  /** Serializes the domain JSON value without running the read-time Zod parser or transforms. */
  mapToDbValue(value: unknown): unknown {
    return JSON.stringify(value);
  }

  // JSON is returned by postgres already parsed, so we should just be able to return our data directly. Unlike with
  // JsonSerde, we can assume that zod would have parsed any complex types in the json correctly so we don't need to
  // do a round trip through JSON.stringify.
  mapToRow(value: any): any {
    return value;
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
