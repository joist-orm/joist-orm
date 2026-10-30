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
   * EntityManager uses this for finds, loads and o2m/o2o/recursive loads.
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
      params: bindings as unknown[],
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

  /**
   * Records a row when PostgreJS supplies its payload as a Buffer slice.
   *
   * PostgreJS calls this on paths that collect raw DataRow messages before decoding them.
   * For example, if a query needs the server's money format, it buffers the rows, finishes
   * the SQL response, obtains that format, and then calls decode for each buffered row
   * before resolving the query. These paths call decode even when decodeAt is implemented.
   *
   * `data` is a view of one row's payload within a larger backing ArrayBuffer, not a copy.
   * We reuse one Buffer spanning that backing allocation and forward the row's offset and
   * length to decodeAt. Neither method parses field values; WireRowData does that later
   * when Joist accesses an entity field.
   */
  decode(parsers: AnyParseFunction[], data: Buffer, count: number, options: DataMappingOptions, fields: FieldInfo[]) {
    if (this.#chunk?.buffer !== data.buffer) this.#chunk = Buffer.from(data.buffer);
    return this.decodeAt(parsers, this.#chunk!, data.byteOffset, data.byteLength, count, options, fields);
  }

  /**
   * Records a row directly from PostgreJS's incoming socket buffer.
   *
   * On the streaming query path, PostgreJS first receives RowDescription and resolves the
   * column metadata and parsers. As each subsequent DataRow arrives, it prefers decodeAt
   * over decode when this method exists, passing the socket buffer plus the row payload's
   * offset and length. This avoids allocating a separate Buffer slice for every row.
   *
   * The first row installs column decoders; every call retains the raw row bytes. PostgreJS
   * stores our undefined return value in its ordinary result.rows, which Joist ignores.
   * Once the query completes, executeFindRowData returns this decoder's WireRowData for
   * entity hydration. Actual field parsing remains deferred until a field is accessed.
   */
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

/** Adapts native parsers to Joist's column decoders without changing their values. */
function columnDecoders(parsers: AnyParseFunction[], fields: FieldInfo[], options: DataMappingOptions) {
  return fields.map((field, index) => ({
    name: field.fieldName,
    decode: (chunk: Buffer, start: number, len: number) => parsers[index](chunk, start, len, options),
  }));
}

let lazyMappingOptions: QueryOptions | undefined;
let eagerMappingOptions: QueryOptions | undefined;

/** Lazily captures application-wide mapping settings after generated metadata initializes them. */
function mappingOptions(lazy = false): QueryOptions {
  if (!lazyMappingOptions || !eagerMappingOptions) {
    const temporal = getRuntimeConfig().temporal;
    if (temporal) requireTemporal();
    lazyMappingOptions = {
      rowDecoder: "object",
      fetchCount: 0,
      rollbackOnError: false,
      unknownTypesAsString: true,
      temporalTypes: temporal ? [1082, 1083, 1114, 1184] : false,
      fetchAsString: temporal ? [] : [1083],
    };
    // Accept Temporal parameters on both paths, but return strings for raw queries to preserve
    // Joist's node-pg-compatible result types. Parsing through Date would lose microseconds;
    // returning Temporal objects would change the values callers receive when switching drivers.
    eagerMappingOptions = { ...lazyMappingOptions, fetchAsString: temporal ? [1082, 1083, 1114, 1184] : [1083] };
  }
  return lazy ? lazyMappingOptions : eagerMappingOptions;
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
      params: params as unknown[],
    })
    .then(toDriverResult);
}

/** Uses rowsAffected for writes and rows.length for SELECTs, which PostgreJS does not count in rowsAffected. */
function toDriverResult(result: QueryResult): DriverQueryResult {
  const rows = result.rows ?? [];
  return {
    rowCount: result.rowsAffected ?? (result.command === "SELECT" ? rows.length : null),
    rows,
  };
}
