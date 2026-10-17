import {
  type EntityManager,
  type ParsedFindQuery,
  PojoRowData,
  type RowData,
  type RuntimeConfig,
  buildRawQuery,
  driverAfterBegin,
  driverAfterCommit,
  driverBeforeBegin,
  driverBeforeCommit,
  getRuntimeConfig,
} from "joist-core";
import pg from "pg";
import { builtins, getTypeParser } from "pg-types";
import array from "postgres-array";

import { AbstractPostgresDriver, type PostgresDriverOpts, toPgParams } from "./AbstractPostgresDriver.ts";
import { registerDatabaseBinaryParsers, registerTemporalBinaryParsers } from "./binaryParsers.ts";
import { ensureLazyDataRows } from "./patchPgProtocol.ts";
import { executeRowDataQuery, isRowDataCapableClient } from "./WireRowData.ts";

export type { PostgresDriverOpts } from "./AbstractPostgresDriver.ts";

/** PostgreSQL over node-pg, with optional patched lazy row decoding. */
export class PostgresDriver extends AbstractPostgresDriver<pg.PoolClient> {
  #databaseBinaryParsers: Promise<void> | undefined;

  constructor(
    readonly pool: pg.Pool,
    opts?: PostgresDriverOpts,
  ) {
    super((sql, bindings) => pool.query(sql, [...bindings]), !!opts?.lazyRows && ensureLazyDataRows(), opts);
    // Set the option before pg creates clients, but preserve an explicit consumer opt-out.
    pool.options.pipeline ??= true;
    if (opts?.lazyRows && !this.lazyRows) {
      console.warn("joist-orm: lazyRows was requested, but patching pg-protocol failed; using classic rows.");
    }
    setupLatestPgTypes(getRuntimeConfig().temporal);
  }

  /** Uses the transaction's socket when a transaction is active. */
  protected query(txn: pg.PoolClient | undefined, sql: string, bindings: readonly unknown[]) {
    return (txn ?? this.pool).query(sql, [...bindings]);
  }

  /** Decodes immutable pg-protocol rows, falling back only for known unsupported clients. */
  protected async findRowData(
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
