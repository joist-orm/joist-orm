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

import { registerDatabaseBinaryParsers, registerTemporalBinaryParsers } from "./binaryParsers.ts";
import { ensureLazyDataRows } from "./patchPgProtocol.ts";
import { flushPostgres, toPgParams } from "./postgresSql.ts";
import { executeRowDataQuery, isRowDataCapableClient } from "./RowDataQuery.ts";

export interface PostgresDriverOpts {
  idAssigner?: IdAssigner;
  /** Sets a default `PreloadPlugin` for any `EntityManager` that uses this driver. */
  preloadPlugin?: PreloadPlugin;
  /** Observes SQL before submission; node-pg does not expose a query event. */
  onQuery?: (sql: string) => void;
  /**
   * Keeps entity find results as raw wire bytes and decodes cells on field access. Defaults to false.
   *
   * Applies to unpaginated em.find/em.load and o2m/o2o/recursive relation loads. Other loaders
   * deliberately stay classic: paginated finds (small pages, measured neutral), m2m join-table
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
    return (txn ?? this.pool).query(sql, [...bindings]);
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
        return new PojoRowData((await (client as pg.PoolClient).query(pgSql, [...bindings])).rows);
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

/** Warns once when lazyRows degrades to classic rows for an unsupported client, i.e. pg-native. */
function warnUnsupportedClientOnce(): void {
  if (warnedUnsupportedClient) return;
  warnedUnsupportedClient = true;
  console.warn("joist-orm: lazyRows is enabled, but this client does not support it; using classic rows.");
}
