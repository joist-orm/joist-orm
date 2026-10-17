import { EventEmitter } from "node:events";

import { type Temporal, getRuntimeConfig } from "joist-core";
import type pg from "pg";
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

import { WireRowData } from "./WireRowData.ts";

/** Identifies the public RowDecoder path without probing node-pg protocol internals. */
export function isPostgreJsPool(pool: unknown): pool is pg.Pool & { postgrejs: Pool } {
  return pool instanceof PostgreJsPool;
}

/**
 * Creates a PostgreJS-backed pool with the pg query/connect surface used by Joist and Knex.
 *
 * This prototype keeps application setup stable while changing every database request's
 * transport. The cast is deliberately confined here: native pg Submittables, COPY streams,
 * cancellation, and pg-specific connection internals are not part of this compatibility surface.
 */
export function createPostgreJsPool(config: pg.PoolConfig = {}): pg.Pool {
  return new PostgreJsPool(config) as unknown as pg.Pool;
}

type Query = string | (pg.QueryConfig & { rowMode?: "array" });
type Callback = (error: Error | null, result?: pg.QueryResult) => void;

/** Owns PostgreJS connections while exposing the pool lifecycle Joist already uses. */
class PostgreJsPool extends EventEmitter {
  readonly postgrejs: Pool;
  readonly options: pg.PoolConfig;

  constructor(config: pg.PoolConfig) {
    super();
    this.options = config;
    const url = config.connectionString ? new URL(config.connectionString) : undefined;
    const timezone = config.options?.match(/(?:TimeZone|timezone)=([^ ]+)/)?.[1];
    this.postgrejs = new native.Pool({
      host: config.host ?? url?.hostname,
      port: config.port ?? (url?.port ? Number(url.port) : undefined),
      user: config.user ?? (url ? decodeURIComponent(url.username) : undefined),
      password: config.password ?? (url ? decodeURIComponent(url.password) : undefined),
      database: config.database ?? url?.pathname.slice(1),
      max: config.max ?? 10,
      timezone: timezone ?? "UTC",
      schema: config.options?.match(/search_path=([^ ,]+)/)?.[1],
      ssl: config.ssl === true ? {} : config.ssl || undefined,
      requireSSL: !!config.ssl,
      connectTimeoutMs: config.connectionTimeoutMillis,
      pipeline: config.pipeline ?? true,
      rollbackOnError: false,
      asyncErrorHandling: false,
      unknownTypesAsString: true,
      typeMap: createTypeMap(),
    });
  }

  /** Acquires a dedicated connection for transactions or Knex. */
  async connect(): Promise<PostgreJsClient> {
    return new PostgreJsClient(await this.postgrejs.acquire());
  }

  /** Executes an ordinary query without reserving a transaction connection. */
  query(query: Query, values?: unknown[] | Callback, callback?: Callback): Promise<pg.QueryResult> {
    return queryWithCallback(this.postgrejs, query, values, callback);
  }

  /** Closes native sockets and waits for all checked-out connections. */
  async end(): Promise<void> {
    await this.postgrejs.close();
  }
}

/** A checked-out native connection; all ORM transaction SQL stays on this socket. */
export class PostgreJsClient extends EventEmitter {
  constructor(readonly connection: Connection) {
    super();
  }

  /** Matches the promise and callback forms used by PostgresDriver and Knex. */
  query(query: Query, values?: unknown[] | Callback, callback?: Callback): Promise<pg.QueryResult> {
    return queryWithCallback(this.connection, query, values, callback);
  }

  /** Returns the dedicated connection to its native pool. */
  async release(): Promise<void> {
    await this.connection.close();
  }

  /** Supplies Joist's existing RowData lifecycle using only the public driver hook. */
  async queryRowData(sql: string, bindings: readonly unknown[]): Promise<WireRowData> {
    const decoder = new PostgreJsRowDecoder();
    await this.connection.query(sql, {
      ...mappingOptions(true),
      pipeline: false,
      params: bindings.map(prepareValue),
      rowDecoder: decoder,
    });
    return decoder.rows;
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
    temporalTypes: temporal && lazy ? [1082, 1083, 1114, 1184] : false,
    // Knex/raw-query callers still expect pg's strings, while lazy hydration can use
    // native Temporal objects. Both retain microseconds and preserve array nulls.
    fetchAsString: temporal && !lazy ? [1082, 1083, 1114, 1184] : temporal ? [] : [1083],
  };
}

/** Normalizes the pg calling convention at the transport boundary. */
function queryWithCallback(
  client: Pool | Connection,
  query: Query,
  values?: unknown[] | Callback,
  callback?: Callback,
): Promise<pg.QueryResult> {
  const sql = typeof query === "string" ? query : query.text;
  const params = typeof query === "string" ? (Array.isArray(values) ? values : []) : (query.values ?? []);
  const cb = typeof values === "function" ? values : callback;
  // A cached statement must not overtake an earlier query still being prepared.
  // Flush can issue several updates to one row, whose oplocks require submission order.
  const promise = client
    .query(sql, {
      ...mappingOptions(),
      pipeline: client instanceof native.Connection ? false : undefined,
      params: params.map(prepareValue),
      rowDecoder: typeof query !== "string" && query.rowMode === "array" ? "array" : "object",
    })
    .then(toPgResult);
  if (cb)
    void promise.then(
      (result) => cb(null, result),
      (error) => cb(error),
    );
  return promise;
}

/** Uses native mutation counts; an unlimited SELECT's complete rows supply its returned-row count. */
function toPgResult(result: QueryResult): pg.QueryResult {
  const rows = result.rows ?? [];
  return {
    command: result.command ?? "",
    rowCount: result.rowsAffected ?? (result.command === "SELECT" ? rows.length : null),
    rows,
    oid: 0,
    fields: [],
  };
}

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
