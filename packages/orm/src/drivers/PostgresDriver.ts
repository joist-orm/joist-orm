import { createRequire } from "node:module";

import {
  type Driver,
  type DriverQueryResult,
  type EntityManager,
  type IdAssigner,
  type JoinRowTodo,
  type ParsedFindQuery,
  PojoRowData,
  type PreloadPlugin,
  type RowData,
  type RuntimeConfig,
  SequenceIdAssigner,
  type Todo,
  buildRawQuery,
  driverAfterBegin,
  driverAfterCommit,
  driverBeforeBegin,
  driverBeforeCommit,
  fail,
  getRuntimeConfig,
} from "joist-core";
import pg from "pg";
import { builtins, getTypeParser } from "pg-types";
import array from "postgres-array";

import { getBinaryTypeParser, registerDatabaseBinaryParsers, registerTemporalBinaryParsers } from "./binaryParsers.ts";
import { ensureLazyDataRows } from "./patchPgProtocol.ts";
import { flushPostgres, toPgParams } from "./postgresSql.ts";
import { WireRowData } from "./WireRowData.ts";

export interface PostgresDriverOpts {
  idAssigner?: IdAssigner;
  /** Sets a default `PreloadPlugin` for any `EntityManager` that uses this driver. */
  preloadPlugin?: PreloadPlugin;
  /** Observes SQL before submission; node-pg does not expose a query event. */
  onQuery?: (sql: string) => void;
  /**
   * Keeps entity find results as raw wire bytes and decodes cells on field access. Defaults to false.
   *
   * Applies to em.find, em.load and o2m/o2o/recursive relation loads.
   * Other loaders deliberately stay classic: m2m join-table
   * rows (narrow, fully read and mutated by JoinRows), lazy columns, and id/count loaders.
   *
   * Binary cells use Joist's parser registry; JOIST_LAZY_BINARY=0 requests text results instead.
   * If patching pg-protocol fails or the client is unsupported (i.e. pg-native), we warn and
   * use classic rows. An unpatched duplicate pg-protocol discovered mid-query fails loudly
   * rather than silently degrading. Deferred parsing also defers custom-parser errors from
   * await em.find to field access. See JS-ROW-STORE-DESIGN.md.
   */
  lazyRows?: boolean;
}

/** PostgreSQL over node-pg, with optional patched lazy row decoding. */
export class PostgresDriver implements Driver<pg.PoolClient> {
  #databaseBinaryParsers: Promise<void> | undefined;
  readonly #idAssigner: IdAssigner;
  readonly #preloadPlugin: PreloadPlugin | undefined;
  private readonly onQuery: PostgresDriverOpts["onQuery"];
  readonly lazyRows: boolean;
  /** Its presence is the lazy-read capability signal checked by EntityManager. */
  readonly executeFindRowData: Driver["executeFindRowData"];

  constructor(
    readonly pool: pg.Pool,
    opts?: PostgresDriverOpts,
  ) {
    this.onQuery = opts?.onQuery;
    this.#preloadPlugin = opts?.preloadPlugin;

    // Sequences assign IDs before bulk insertion, including mutually dependent new entities.
    this.#idAssigner =
      opts?.idAssigner ?? new SequenceIdAssigner(async (sql) => (await this.query(undefined, sql, [])).rows);

    this.lazyRows = !!opts?.lazyRows && ensureLazyDataRows();
    this.executeFindRowData = this.lazyRows
      ? (em, parsed, settings) => this.findRowData(em, parsed, settings)
      : undefined;

    // Set the option before pg creates clients, but preserve an explicit consumer opt-out.
    pool.options.pipeline ??= true;
    if (opts?.lazyRows && !this.lazyRows) {
      console.warn("joist-orm: lazyRows was requested, but patching pg-protocol failed; using classic rows.");
    }
    setupLatestPgTypes(getRuntimeConfig().temporal);
  }

  /** Uses the transaction's socket when a transaction is active. */
  private query(txn: pg.PoolClient | undefined, sql: string, bindings: readonly unknown[]) {
    this.onQuery?.(sql);
    return (txn ?? this.pool).query(sql, bindings as unknown[]);
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

  /** Returns native command counts and rows, including null counts for DDL. */
  async executeQuery(em: EntityManager, sql: string, bindings: readonly unknown[]): Promise<DriverQueryResult> {
    const { rowCount, rows } = await this.query(em.txn as pg.PoolClient | undefined, toPgParams(sql), bindings);
    return { rowCount, rows };
  }

  /** Assigns identifiers with the configured strategy before dependent writes. */
  async assignNewIds(_: EntityManager, todos: Record<string, Todo>): Promise<void> {
    await this.#idAssigner.assignNewIds(todos);
  }

  /** Flushes PostgreSQL operations on the active node-pg transaction. */
  async flush(
    em: EntityManager,
    entityTodos: Record<string, Todo>,
    joinRows: Record<string, JoinRowTodo>,
  ): Promise<void> {
    const txn = (em.txn ?? fail("Expected EntityManager.txn to be set")) as pg.PoolClient;
    await this.#idAssigner.assignNewIds(entityTodos);
    await flushPostgres((sql, bindings) => this.query(txn, sql, bindings), entityTodos, joinRows);
  }

  get defaultPlugins() {
    return { preloadPlugin: this.#preloadPlugin };
  }

  /** Decodes immutable pg-protocol rows, falling back only for known unsupported clients. */
  private async findRowData(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<RowData> {
    // Auto-register binary parsers for the db's dynamic-oid text-likes (native enums, citext)
    // once, before our first lazy query; on failure, reset so the next query retries.
    await (this.#databaseBinaryParsers ??= registerDatabaseBinaryParsers(this.pool).catch((err) => {
      this.#databaseBinaryParsers = undefined;
      throw err;
    }));
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    const pgSql = toPgParams(sql);
    this.onQuery?.(pgSql);
    // pg-pool rejects Submittables in pool.query; choose classic-vs-lazy before submitting.
    const txn = em.txn as pg.PoolClient | undefined;
    const client = txn ?? (await this.pool.connect());
    try {
      if (!isRowDataCapableClient(client)) {
        warnUnsupportedClientOnce();
        return new PojoRowData((await (client as pg.PoolClient).query(pgSql, bindings as unknown[])).rows);
      }
      return await executeRowDataQuery(client, pgSql, bindings);
    } finally {
      if (!txn) client.release();
    }
  }

  /**
   * Runs hooks and SQL on one checked-out native pg client.
   *
   * Nested calls reuse the active transaction rather than starting a second one.
   */
  async transaction<T>(em: EntityManager, fn: (txn: pg.PoolClient) => Promise<T>): Promise<T> {
    if (em.txn) return fn(em.txn as pg.PoolClient);
    const client = await this.pool.connect();
    let result: T;
    try {
      await driverBeforeBegin(em, client);
      this.onQuery?.("BEGIN;");
      await client.query("BEGIN");
      em.txn = client;
      try {
        await driverAfterBegin(em, client);
        result = await fn(client);
        await driverBeforeCommit(em, client);
        this.onQuery?.("COMMIT;");
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        em.txn = undefined;
      }
      await driverAfterCommit(em, client);
    } finally {
      client.release();
    }
    return result;
  }
}

/**
 * Configures the `pg` driver with the best type parsers.
 *
 * In particular, pg's default `TIMESTAMPTZ` parser is very inefficient, and even just
 * pulling in the latest `pg-types` and installing the fixed parser makes a noticeable difference.
 */
export function setupLatestPgTypes(temporal: RuntimeConfig["temporal"]): void {
  if (temporal) {
    // Don't eagerly parse the strings, instead defer to the serde logic. This only governs
    // classic *text* results (knex, pool.query, non-lazy drivers); binary lazy cells construct
    // Temporal values directly, with no strings involved (see registerTemporalBinaryParsers).
    function noop(s: string) {
      return s;
    }
    function noopArray(s: string) {
      return array.parse(s, noop);
    }
    const { TIMESTAMP, TIMESTAMPTZ, DATE } = pg.types.builtins;
    pg.types.setTypeParser(DATE, noop);
    pg.types.setTypeParser(TIMESTAMP, noop);
    pg.types.setTypeParser(TIMESTAMPTZ, noop);
    // Use `as number` b/c the typings of shadowed pg-types from `pg` and `pg-types` top-level don't line up.
    pg.types.setTypeParser(1182 as number, noopArray); // date[]
    pg.types.setTypeParser(1115 as number, noopArray); // timestamp[]
    pg.types.setTypeParser(1185 as number, noopArray); // timestamptz[]
    registerTemporalBinaryParsers();
  } else {
    pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, getTypeParser(builtins.TIMESTAMPTZ));
    // The binary registry's date/timestamp/timestamptz builtins already decode to Dates.
  }
}

let warnedUnsupportedClient = false;

const runtimeRequire = createRequire(import.meta.url);

// pg's internal-but-exported Query class; subclassing it reuses its extended-protocol
// submit/bind logic while letting us intercept row handling (the same seam pg-cursor uses).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PgQuery: any = runtimeRequire("pg/lib/query");

// The prototype escape hatch for binary results, i.e. for A/B benchmarking; read once at load.
const BINARY_BY_DEFAULT = process.env.JOIST_LAZY_BINARY !== "0";

/** A pg Query that diverts DataRows into a {@link WireRowData} instead of a `Result`. */
class RowDataQuery extends PgQuery {
  #wire = new WireRowData();

  constructor(
    config: { text: string; values: any[]; binary?: boolean; queryMode?: string },
    callback: (err: unknown) => void,
  ) {
    super(config, undefined, callback);
  }

  /**
   * The query's result rows, i.e. once our callback has fired.
   *
   * If a small-result materialization threshold ever seems attractive, this is where it would
   * go — but see the "Small results deliberately stay lazy" note on WireRowData: lazy
   * won the measured comparison at every row count for sparse access, so no threshold exists.
   */
  get rowData(): RowData {
    return this.#wire;
  }

  handleRowDescription(msg: any): void {
    if (this._canceledDueToError) return;
    try {
      super.handleRowDescription(msg);
      // Resolve active text parsers through the client's TypeOverrides chain (client.js
      // injects `_types` at submit time). Binary fields use Joist's binary registry instead
      // of pg's broken binary parsing of UTF-8 strings.
      const types = this._result?._types;
      this.#wire.setColumnDecoders(
        pgColumnDecoders(msg.fields, types && ((oid: number) => types.getTypeParser(oid, "text"))),
      );
    } catch (err) {
      // Mirror pg's Query error containment: record + reject at ReadyForQuery, keeping the
      // connection's protocol state intact.
      this._canceledDueToError = err;
    }
  }

  handleDataRow(msg: any): void {
    if (this._canceledDueToError) return;
    try {
      if (msg.bytes === undefined) {
        // This connection's pg-protocol copy is unpatched (i.e. the pool came from a different
        // `pg` install than the one joist-orm patched), so lazyRows cannot work — fail loudly
        // rather than silently degrade; any CI build/smoketest will surface this immediately.
        throw new Error(
          "joist-orm: lazyRows is enabled, but this connection's pg-protocol emits classic" +
            " DataRows (likely a duplicate pg install); fix the install or disable lazyRows.",
        );
      }
      // `msg.length` includes the int32 length field itself, so the payload is `length - 4`;
      // our patched message carries the real length from `handlePacket`'s argument.
      this.#wire.addRow(msg.bytes, msg.offset, msg.length - 4);
    } catch (err) {
      this._canceledDueToError = err;
    }
  }
}

/**
 * Executes `sql` on an already-checked-out client, returning a {@link RowData} instead of
 * materialized POJO rows.
 *
 * Uses a `pg` Query subclass that records each DataRow's raw payload bytes into the result
 * (via the lazy DataRow message from `patchPgProtocol`) and never materializes per-cell
 * strings or per-row objects. If the client's connection turns out to use an unpatched
 * pg-protocol copy (i.e. the app's pool was built from a different `pg` install than the one
 * joist-orm patched), the query fails with a descriptive error — a misconfiguration any CI
 * build/smoketest will surface immediately, so we fail loudly rather than silently degrade.
 * The rows already streamed are discarded; the connection itself stays usable.
 *
 * By default the query requests binary result format via the extended protocol.
 * Pass `binary: false` for classic text-format results, or set `JOIST_LAZY_BINARY=0`
 * for A/B benchmarking or as an escape hatch.
 */
export function executeRowDataQuery(
  client: pg.PoolClient,
  sql: string,
  bindings: readonly any[],
  opts?: { binary?: boolean },
): Promise<RowData> {
  const binary = opts?.binary ?? BINARY_BY_DEFAULT;
  return new Promise((resolve, reject) => {
    const query = new RowDataQuery(
      // Binary results require the extended protocol; `queryMode` forces it for bindings-less queries.
      binary
        ? { text: sql, values: bindings as any[], binary: true, queryMode: "extended" }
        : { text: sql, values: bindings as any[] },
      (err: unknown) => {
        if (err) reject(err);
        else resolve(query.rowData);
      },
    );
    client.query(query as any);
  });
}

/** Returns whether `client` supports the lazy row-data query path, before submitting anything. */
function isRowDataCapableClient(client: unknown): client is pg.PoolClient {
  // Require the pure-JS pg client (pg-native has no `connection` and different query internals).
  return (
    typeof client === "object" &&
    client !== null &&
    typeof (client as any).query === "function" &&
    (client as any).connection !== undefined &&
    (client as any).native === undefined
  );
}

/**
 * Resolves each column's decoder from the query's RowDescription.
 *
 * Binary-format fields decode through Joist's own binary registry only (see
 * `setBinaryTypeParser`) — `pg.types`/`TypeOverrides` are never consulted, and a column whose
 * oid has no registered binary parser fails the query here, before any rows arrive, rather
 * than guessing at a lossy decoding. Text-format fields (the `binary: false` escape hatch)
 * decode by utf8-slicing the cell into the active text parser, resolved via `getTypeParser`
 * (i.e. the pool/client `TypeOverrides` chain) or the global registry.
 */
export function pgColumnDecoders(
  fields: Array<{ name: string; dataTypeID: number; format?: string }>,
  getTypeParser?: (dataTypeID: number) => (value: any) => any,
) {
  return fields.map((field) => {
    const { name, dataTypeID, format } = field;
    let decode;
    if (format === "binary") {
      decode = getBinaryTypeParser(dataTypeID);
      if (decode === undefined) {
        throw new Error(
          `joist-orm: no binary type parser registered for oid ${dataTypeID} (column "${name}");` +
            ` register one with setBinaryTypeParser (i.e. binaryTextParser for text-like types)`,
        );
      }
    } else {
      const parse = getTypeParser?.(dataTypeID) ?? pg.types.getTypeParser(dataTypeID, "text");
      decode = textCellDecoder(parse);
    }
    return { name, decode };
  });
}

/** Builds a text-format cell decoder: utf8-slice the cell bytes into the active text parser. */
function textCellDecoder(parse: (value: any) => any): (chunk: Buffer, start: number, length: number) => any {
  return (chunk, start, length) => parse(chunk.toString("utf8", start, start + length));
}

/** Warns once when lazyRows degrades to classic rows for an unsupported client, i.e. pg-native. */
function warnUnsupportedClientOnce(): void {
  if (warnedUnsupportedClient) return;
  warnedUnsupportedClient = true;
  console.warn("joist-orm: lazyRows is enabled, but this client does not support it; using classic rows.");
}
