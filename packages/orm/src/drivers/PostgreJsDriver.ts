import {
  type Driver,
  type DriverQueryResult,
  type EntityManager,
  type IdAssigner,
  type JoinRowTodo,
  type ParsedFindQuery,
  type PreloadPlugin,
  type RowData,
  SequenceIdAssigner,
  type Temporal,
  type Todo,
  buildRawQuery,
  driverAfterBegin,
  driverAfterCommit,
  driverBeforeBegin,
  driverBeforeCommit,
  fail,
  getRuntimeConfig,
  requireTemporal,
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

import { flushPostgres, toPgParams } from "./postgresSql.ts";
import { WireRowData } from "./WireRowData.ts";

export interface PostgreJsDriverOpts {
  idAssigner?: IdAssigner;
  /** Sets a default `PreloadPlugin` for any `EntityManager` that uses this driver. */
  preloadPlugin?: PreloadPlugin;
  /** Observes SQL before submission to PostgreJS. */
  onQuery?: (sql: string) => void;
}

/** PostgreSQL over native PostgreJS pools and transaction connections. */
export class PostgreJsDriver implements Driver<Connection> {
  readonly #idAssigner: IdAssigner;
  readonly #preloadPlugin: PreloadPlugin | undefined;
  private readonly onQuery: PostgreJsDriverOpts["onQuery"];

  constructor(
    readonly pool: Pool,
    opts?: PostgreJsDriverOpts,
  ) {
    this.onQuery = opts?.onQuery;
    this.#preloadPlugin = opts?.preloadPlugin;

    this.#idAssigner =
      opts?.idAssigner ?? new SequenceIdAssigner(async (sql) => (await this.query(undefined, sql, [])).rows);
  }

  /** Executes through the native pool or the transaction's native connection. */
  private query(txn: Connection | undefined, sql: string, bindings: readonly unknown[]): Promise<DriverQueryResult> {
    this.onQuery?.(sql);
    return executeNativeQuery(txn ?? this.pool, sql, bindings);
  }

  /** Executes an entity find with the EntityManager's default limit. */
  async executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]> {
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    return (await this.executeQuery(em, sql, bindings)).rows;
  }

  /** Returns PostgreJS command counts and rows through Joist's query boundary. */
  executeQuery(em: EntityManager, sql: string, bindings: readonly unknown[]): Promise<DriverQueryResult> {
    return this.query(em.txn as Connection | undefined, toPgParams(sql), bindings);
  }

  /** Assigns identifiers with the configured strategy before dependent writes. */
  async assignNewIds(_: EntityManager, todos: Record<string, Todo>): Promise<void> {
    await this.#idAssigner.assignNewIds(todos);
  }

  /** Flushes PostgreSQL operations on the active native PostgreJS transaction. */
  async flush(
    em: EntityManager,
    entityTodos: Record<string, Todo>,
    joinRows: Record<string, JoinRowTodo>,
  ): Promise<void> {
    const txn = (em.txn ?? fail("Expected EntityManager.txn to be set")) as Connection;
    await this.#idAssigner.assignNewIds(entityTodos);
    await flushPostgres((sql, bindings) => this.query(txn, sql, bindings), entityTodos, joinRows);
  }

  get defaultPlugins() {
    return { preloadPlugin: this.#preloadPlugin };
  }

  /**
   * Supplies lazy entity rows through PostgreJS's native decoder hook.
   *
   * EntityManager uses this for finds (including paginated finds), loads and o2m/o2o/recursive loads.
   * M2m join-table rows, lazy columns and id/count queries use eager results.
   * Deferred parser errors surface on field access.
   */
  async executeFindRowData(
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
      params: [...bindings],
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
      // Use separate function scopes and copy only decoding options so the stored closures cannot
      // capture decodeAt's socket buffer or the original query options, which also hold params.
      this.rows.setColumnDecoders(columnDecoders(parsers, fields, decodingOptions(options)));
    }
    this.rows.addRow(buffer, offset, length);
    return undefined;
  }
}

/** Selects the options used to decode field values. */
function decodingOptions(options: DataMappingOptions): DataMappingOptions {
  return {
    decimalAsString: options.decimalAsString,
    temporalTypes: options.temporalTypes,
    timeZone: options.timeZone,
    dateStyle: options.dateStyle,
    moneyFormat: options.moneyFormat,
    utcDates: options.utcDates,
    fetchAsString: options.fetchAsString,
    unknownTypesAsString: options.unknownTypesAsString,
  };
}

/** Adapts native parsers to Joist's column decoders and Temporal time-zone representation. */
function columnDecoders(parsers: AnyParseFunction[], fields: FieldInfo[], options: DataMappingOptions) {
  return fields.map((field, index) => ({
    name: field.fieldName,
    decode:
      options.temporalTypes && (field.dataTypeId === 1184 || field.dataTypeId === 1185)
        ? (chunk: Buffer, start: number, len: number) => normalizeTimeZone(parsers[index](chunk, start, len, options))
        : (chunk: Buffer, start: number, len: number) => parsers[index](chunk, start, len, options),
  }));
}

/** Keeps Temporal's microseconds through decoding instead of rounding through Date. */
function mappingOptions(lazy = false): QueryOptions {
  const temporal = getRuntimeConfig().temporal;
  if (temporal) requireTemporal();
  return {
    rowDecoder: "object",
    fetchCount: 0,
    rollbackOnError: false,
    typeMap: joistTypeMap,
    unknownTypesAsString: true,
    temporalTypes: temporal ? [1082, 1083, 1114, 1184] : false,
    // Accept Temporal parameters on both paths, but retain lossless strings for raw-query callers.
    fetchAsString: temporal && !lazy ? [1082, 1083, 1114, 1184] : temporal ? [] : [1083],
  };
}

/** Executes with Joist's value representations without changing the caller's pool configuration. */
async function executeNativeQuery(
  client: Pool | Connection,
  sql: string,
  params: readonly unknown[],
): Promise<DriverQueryResult> {
  return client
    .query(sql, {
      ...mappingOptions(),
      params: [...params],
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

/**
 * Preserves pg's exact scalar numerics and int8 strings without forcing text-format results.
 *
 * PostgreJS intentionally returns number/bigint for int8 and number/Numeric for numeric,
 * depending on the value. Those defaults preserve precision but differ from pg's strings.
 * These overrides preserve Joist's existing result representations, not fix upstream bugs;
 * PostgreJS does not need to change its defaults to match pg.
 */
function createTypeMap(): native.DataTypeMap {
  const types = new native.DataTypeMap(native.GlobalTypeMap);

  // pg returns every int8 as a string, even when the value would fit in a JS number.
  const int8 = types.get(20);
  types.register({
    ...int8,
    decodeBinary: (buffer, offset, length, options) => String(int8.decodeBinary(buffer, offset, length, options)),
    decodeText: (text) => text,
    decodeTextBuffer: (buffer, offset, length) => buffer.toString("utf8", offset, offset + length),
  });

  // int8[] (OID 1016) stores its own element decoders; overriding int8 does not update them.
  // Reuse the string decoders so array elements keep the same representation as pg's int8[].
  types.register({
    ...types.get(1016),
    decodeBinary: types.get(20).decodeBinary,
    decodeText: types.get(20).decodeText,
  });

  // Scalar numeric (OID 1700) must stay an exact string, including scale (i.e. "12.340").
  // Use native decimalAsString for binary cells and pass text through without parsing it.
  // Keep this scalar-only: pg returns numbers for numeric[] rather than scalar-style strings.
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

/** Joist's text serde uses the server-rendered offset, not a named zone with future DST rules. */
function normalizeTimeZone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeTimeZone);
  if (value === null) return null;
  const date = value as Temporal.ZonedDateTime;
  return date.withTimeZone(date.offset === "+00:00" ? "UTC" : date.offset);
}
