import { createRequire } from "node:module";

import type { RowData } from "joist-core";
import pg from "pg";

import { getBinaryTypeParser } from "./binaryParsers.ts";
import { RawRowData } from "./RawRowData.ts";

const runtimeRequire = createRequire(import.meta.url);

// pg's internal-but-exported Query class; subclassing it reuses its extended-protocol
// submit/bind logic while letting us intercept row handling (the same seam pg-cursor uses).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PgQuery: any = runtimeRequire("pg/lib/query");

/** Adds node-pg parser resolution to the transport-independent row store. */
export class WireRowData extends RawRowData {
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
  setRowDescription(
    fields: Array<{ name: string; dataTypeID: number; format?: string }>,
    getTypeParser?: (dataTypeID: number) => (value: any) => any,
  ): void {
    this.setColumnDecoders(
      fields.map((field) => {
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
      }),
    );
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
export function isRowDataCapableClient(client: unknown): client is pg.PoolClient {
  // Require the pure-JS pg client (pg-native has no `connection` and different query internals).
  return (
    typeof client === "object" &&
    client !== null &&
    typeof (client as any).query === "function" &&
    (client as any).connection !== undefined &&
    (client as any).native === undefined
  );
}

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
   * go — but see the "Small results deliberately stay lazy" note on RawRowData: lazy
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
      this.#wire.setRowDescription(msg.fields, types && ((oid: number) => types.getTypeParser(oid, "text")));
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

/** Builds a text-format cell decoder: utf8-slice the cell bytes into the active text parser. */
function textCellDecoder(parse: (value: any) => any): (chunk: Buffer, start: number, length: number) => any {
  return (chunk, start, length) => parse(chunk.toString("utf8", start, start + length));
}
