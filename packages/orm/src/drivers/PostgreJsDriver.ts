import {
  type DriverQueryResult,
  type EntityManager,
  type ParsedFindQuery,
  type RowData,
  type Temporal,
  buildRawQuery,
  driverAfterBegin,
  driverAfterCommit,
  driverBeforeBegin,
  driverBeforeCommit,
  getRuntimeConfig,
} from "joist-core";
import * as native from "postgrejs";
import type {
  AnyParseFunction,
  Connection,
  DataMappingOptions,
  FieldInfo,
  Pool,
  QueryOptions,
  QueryResult,
} from "postgrejs";

import { AbstractPostgresDriver, type PostgresDriverOpts, toPgParams } from "./AbstractPostgresDriver.ts";
import { WireRowData } from "./WireRowData.ts";

export type PostgreJsDriverOpts = PostgresDriverOpts;

/** PostgreSQL over native PostgreJS pools and transaction connections. */
export class PostgreJsDriver extends AbstractPostgresDriver<Connection> {
  constructor(
    readonly pool: Pool,
    opts?: PostgreJsDriverOpts,
  ) {
    super((sql, bindings) => executeNativeQuery(pool, sql, bindings), opts?.lazyRows ?? true, opts);
  }

  /** Executes through the native pool or the transaction's native connection. */
  protected query(txn: Connection | undefined, sql: string, bindings: readonly unknown[]): Promise<DriverQueryResult> {
    return executeNativeQuery(txn ?? this.pool, sql, bindings);
  }

  /** Supplies Joist's RowData lifecycle using only PostgreJS's public decoder hook. */
  protected async findRowData(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<RowData> {
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    const pgSql = toPgParams(sql);
    this.onQuery?.(pgSql);
    const decoder = new PostgreJsRowDecoder();
    const client = (em.txn as Connection | undefined) ?? this.pool;
    await client.query(pgSql, {
      ...mappingOptions(true),
      pipeline: false,
      params: bindings.map(prepareValue),
      rowDecoder: decoder,
    });
    return decoder.rows;
  }

  /**
   * Preserves transaction hooks and rollback on a dedicated native connection.
   *
   * The callback and all ORM queries share this Connection; close returns it to its pool.
   */
  async transaction<T>(em: EntityManager, fn: (txn: Connection) => Promise<T>): Promise<T> {
    if (em.txn) return fn(em.txn as Connection);
    const client = await this.pool.acquire();
    let result: T;
    try {
      await driverBeforeBegin(em, client);
      this.onQuery?.("BEGIN;");
      await executeNativeQuery(client, "BEGIN", []);
      em.txn = client;
      try {
        await driverAfterBegin(em, client);
        result = await fn(client);
        await driverBeforeCommit(em, client);
        this.onQuery?.("COMMIT;");
        await executeNativeQuery(client, "COMMIT", []);
      } catch (error) {
        await executeNativeQuery(client, "ROLLBACK", []);
        throw error;
      } finally {
        em.txn = undefined;
      }
      await driverAfterCommit(em, client);
    } finally {
      await client.close();
    }
    return result;
  }
}

/** Records immutable raw rows, leaving all value construction to field access. */
export class PostgreJsRowDecoder extends native.RowDecoder {
  readonly rows = new WireRowData(0);
  #chunk: Buffer | undefined;

  /** Supports the view-based fallback of PostgreJS's public decoder contract. */
  decode(parsers: AnyParseFunction[], data: Buffer, count: number, options: DataMappingOptions, fields: FieldInfo[]) {
    if (this.#chunk?.buffer !== data.buffer) this.#chunk = Buffer.from(data.buffer);
    return this.decodeAt(parsers, this.#chunk!, data.byteOffset, data.byteLength, count, options, fields);
  }

  /** Shares socket buffers directly, avoiding even a per-row Buffer view. */
  override decodeAt(
    parsers: AnyParseFunction[],
    buffer: Buffer,
    offset: number,
    length: number,
    _count: number,
    options: DataMappingOptions,
    fields: FieldInfo[],
  ) {
    if (this.rows.rowCount === 0) {
      this.rows.setColumnDecoders(
        fields.map((field, index) => ({
          name: field.fieldName,
          decode:
            options.temporalTypes && (field.dataTypeId === 1184 || field.dataTypeId === 1185)
              ? (chunk, start, len) => normalizeTimeZone(parsers[index](chunk, start, len, options))
              : (chunk, start, len) => parsers[index](chunk, start, len, options),
        })),
      );
    }
    this.rows.addRow(buffer, offset, length);
    return undefined;
  }
}

/** Keeps Temporal's microseconds through decoding instead of rounding through Date. */
function mappingOptions(lazy = false): QueryOptions {
  const temporal = getRuntimeConfig().temporal;
  return {
    rowDecoder: "object",
    fetchCount: 0,
    rollbackOnError: false,
    typeMap: joistTypeMap,
    unknownTypesAsString: true,
    temporalTypes: temporal && lazy ? [1082, 1083, 1114, 1184] : false,
    // Joist raw-query callers still expect pg-compatible strings, while lazy hydration can use
    // native Temporal objects. Both retain microseconds and preserve array nulls.
    fetchAsString: temporal && !lazy ? [1082, 1083, 1114, 1184] : temporal ? [] : [1083],
  };
}

/** Executes with Joist's value representations without changing the caller's pool configuration. */
async function executeNativeQuery(
  client: Pool | Connection,
  sql: string,
  params: readonly unknown[],
): Promise<DriverQueryResult> {
  // A cached statement must not overtake an earlier query still being prepared.
  // Flush can issue several updates to one row, whose oplocks require submission order.
  return client
    .query(sql, {
      ...mappingOptions(),
      pipeline: client instanceof native.Connection ? false : undefined,
      params: params.map(prepareValue),
    })
    .then(toDriverResult);
}

/** Uses native mutation counts; an unlimited SELECT's complete rows supply its returned-row count. */
function toDriverResult(result: QueryResult): DriverQueryResult {
  const rows = result.rows ?? [];
  return {
    rowCount: result.rowsAffected ?? (result.command === "SELECT" ? rows.length : null),
    rows,
  };
}

const joistTypeMap = createTypeMap();

/** Preserves pg's exact scalar numerics and int8 strings without forcing text-format results. */
function createTypeMap(): native.DataTypeMap {
  const types = new native.DataTypeMap(native.GlobalTypeMap);
  const int8 = types.get(20);
  types.register({
    ...int8,
    decodeBinary: (buffer, offset, length, options) => String(int8.decodeBinary(buffer, offset, length, options)),
    decodeText: (text) => text,
    decodeTextBuffer: (buffer, offset, length) => buffer.toString("utf8", offset, offset + length),
  });
  types.register({
    ...types.get(1016),
    decodeBinary: types.get(20).decodeBinary,
    decodeText: types.get(20).decodeText,
  });
  const numeric = types.get(1700);
  types.register({
    ...numeric,
    decodeBinary: (buffer, offset, length, options) =>
      numeric.decodeBinary(buffer, offset, length, { ...options, decimalAsString: [1700] }),
    decodeText: (text) => text,
    decodeTextBuffer: (buffer, offset, length) => buffer.toString("utf8", offset, offset + length),
  });
  return types;
}

/**
 * Normalizes pg-compatible parameters before PostgreJS infers their wire types.
 *
 * Keep array elements consistent: Date sentinels, Temporal objects and typed byte
 * arrays must not cause the driver to choose the wrong encoder for the whole array.
 */
function prepareValue(value: unknown): unknown {
  // Nullable array writes mix a Date sentinel with date strings. PostgreJS otherwise
  // chooses one date formatter for the entire array and shifts the strings' calendar day.
  if (value instanceof Date) return formatDateParameter(value);
  if (ArrayBuffer.isView(value) && !Buffer.isBuffer(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return value.map(prepareValue);
  if (value !== null && typeof value === "object") {
    const tag = Object.prototype.toString.call(value);
    if (tag === "[object Temporal.ZonedDateTime]") {
      return (value as Temporal.ZonedDateTime).toString({ timeZoneName: "never" });
    }
    if (tag.startsWith("[object Temporal.")) return String(value);
  }
  return value;
}

/** Preserves pg's local wall-clock representation and its explicit UTC offset. */
function formatDateParameter(value: Date): string {
  const offset = -value.getTimezoneOffset();
  const local = new Date(value.getTime() + offset * 60_000).toISOString().slice(0, -1);
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${local}${offset >= 0 ? "+" : "-"}${hours}:${minutes}`;
}

/** Joist's text serde uses the server-rendered offset, not a named zone with future DST rules. */
function normalizeTimeZone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeTimeZone);
  if (value === null) return null;
  const date = value as Temporal.ZonedDateTime;
  return date.withTimeZone(date.offset === "+00:00" ? "UTC" : date.offset);
}
