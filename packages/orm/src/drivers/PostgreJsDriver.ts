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
  /**
   * Uses PostgreJS's public decoder hook for lazy entity hydration. Defaults to true.
   *
   * Applies to unpaginated entity finds/loads and o2m/o2o/recursive loads. Paginated finds,
   * m2m join-table rows, lazy columns and id/count queries still use eager results.
   * Set false to eagerly decode all results. Deferred parser errors surface on field access.
   */
  lazyRows?: boolean;
}

/** PostgreSQL over native PostgreJS pools and transaction connections. */
export class PostgreJsDriver implements Driver<Connection> {
  readonly #idAssigner: IdAssigner;
  readonly #preloadPlugin: PreloadPlugin | undefined;
  private readonly onQuery: PostgreJsDriverOpts["onQuery"];
  readonly lazyRows: boolean;
  /** Its presence is the lazy-read capability signal checked by EntityManager. */
  readonly executeFindRowData: Driver["executeFindRowData"];

  constructor(
    readonly pool: Pool,
    opts?: PostgreJsDriverOpts,
  ) {
    this.onQuery = opts?.onQuery;
    this.#preloadPlugin = opts?.preloadPlugin;

    this.#idAssigner =
      opts?.idAssigner ?? new SequenceIdAssigner(async (sql) => (await this.query(undefined, sql, [])).rows);

    this.lazyRows = opts?.lazyRows ?? true;
    this.executeFindRowData = this.lazyRows
      ? (em, parsed, settings) => this.findRowData(em, parsed, settings)
      : undefined;
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

  /** Supplies Joist's RowData lifecycle using only PostgreJS's public decoder hook. */
  private async findRowData(
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
