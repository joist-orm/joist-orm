import { RowData } from "joist-core";
import pg from "pg";
import { wireBinaryParser } from "./binaryParsers";

// pg's internal-but-exported Query class; subclassing it reuses its extended-protocol
// submit/bind logic while letting us intercept row handling (the same seam pg-cursor uses).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PgQuery: any = require("pg/lib/query");

/** One column's RowDescription-derived metadata, resolved once per query. */
type WireColumn = {
  name: string;
  ordinal: number;
  /** Decodes this column's cell bytes to its value; see `setRowDescription`. */
  decode: (chunk: Buffer, start: number, length: number) => any;
};

// Each row is three consecutive entries in the `#rows` table: chunk index, start, length
const ROW_STRIDE = 3;

/** The row-length sentinel for rows dropped by `finalize` compaction. */
const DROPPED = 0xffffffff;

/** Only compact when dropped rows hold more than this fraction of the payload bytes. */
const COMPACT_THRESHOLD = 0.2;

/**
 * Only allocate the adaptive scan cursor once a fault targets at least this ordinal: shallower
 * scans cost less than the cursor's bookkeeping, i.e. hydrate-only results (id is ordinal ~0)
 * and narrow reads never pay the 6 bytes/row.
 */
const SCAN_CURSOR_MIN_ORDINAL = 8;

/**
 * A lazy wire-row {@link RowData} over raw Postgres `DataRow` payload bytes.
 *
 * Each query produces its own `WireRowData` — one query, one result; results are never combined
 * or appended across queries, and the payload is read-only after the query completes (entity
 * mutations go into `InstanceData.data`, never back into the row bytes).
 *
 * Rows are kept in their row-major wire format (`int16 fieldCount` + length-prefixed cells) as
 * zero-copy views over the parser's own immutable buffers: `addRow` records each DataRow's
 * `(bytes, offset, length)` by reference, deduping the socket chunk that consecutive rows
 * share. (Our pg-protocol patch guarantees message bytes are never rewritten — chunks parse in
 * place and straddling messages get a buffer of their own; see `patchPgProtocol.ts`.) A
 * `row × column` cell is decoded on first field access by scanning the row's length-prefixed
 * cells to the column's ordinal ("row-lazy" decode, see JS-ROW-STORE-DESIGN.md §3/C2). This is
 * deferred decoding of row-major data, not a columnar layout.
 *
 * Because chunks are whole socket reads, retaining any row pins its ~64KiB chunk (plus whatever
 * protocol frames share it); `finalize`'s compaction copies retained rows out into an
 * exact-size owned buffer when enough of the payload was dropped.
 *
 * Text-format cells go through the same active text parsers node-postgres would resolve for
 * the query (i.e. honoring pool/client `TypeOverrides`), so they parse identically to classic
 * rows. Binary-format cells decode via `wireBinaryParser`: wire bytes -> value directly for
 * default-parsed scalar types (no intermediate string), else rendered to pg's canonical text
 * and fed through the active text parser for parity. (Classic node-postgres cannot do binary
 * at all — it round-trips cells through a UTF-8 string, corrupting bytes >= 0x80.)
 *
 * Because decoding is deferred, a custom parser that throws will do so on first field access
 * (or `toRow`/`toRows`), not while awaiting the query; `id` and inheritance-discriminator cells
 * still decode during hydration.
 *
 * After hydration, `finalize` trims unused capacity and, when some rows were not retained (i.e.
 * their entities were already in the identity map), compacts the payload down to only the
 * retained rows, so retained memory tracks live entities rather than query history.
 *
 * Small results deliberately stay lazy — there is NO row-count threshold below which we
 * materialize to a `PojoRowData` instead. Measured (benchmark-rowdata-small.ts, 40-col rows):
 * for the typical sparse access pattern (~6 of 40 columns read), keeping the lazy result wins at
 * every size including a single row (n=1: 4.3µs vs 7.6µs; n=1000: 0.76ms vs 3.0ms), because
 * materialization eagerly decodes every column while lazy faults only what is read. Even full
 * column coverage no longer flips the winner: with binary decode and `#readCell`'s adaptive
 * scan cursor, reading all ~36 columns of every row measures ~parity with classic end-to-end
 * (benchmark-lazy-parsing.ts), and small finds (n <= 10) are statistically identical.
 */
export class WireRowData implements RowData {
  #chunks: Buffer[] = [];
  /** Per-row `(chunk index, start, length)` triples, `ROW_STRIDE` entries per row. */
  #rows: Uint32Array<ArrayBufferLike> = new Uint32Array(16 * ROW_STRIDE);
  #rowCount = 0;
  #payloadBytes = 0;
  #retained: number[] | undefined = undefined;
  #columns: Map<string, WireColumn> = new Map();
  #fields: WireColumn[] = [];
  /** The adaptive scan cursor: per row, the furthest scanned ordinal + its offset (see #readCell). */
  #scanOrdinal: Uint16Array | undefined = undefined;
  #scanOffset: Uint32Array | undefined = undefined;

  get rowCount(): number {
    return this.#rowCount;
  }

  /** The DataRow payload bytes currently indexed; drops when compaction discards rows. */
  get payloadBytes(): number {
    return this.#payloadBytes;
  }

  /** The bytes currently held by payload chunks + the row-index table, i.e. for benchmarks. */
  get memoryBytes(): number {
    let bytes = this.#rows.byteLength;
    for (const chunk of this.#chunks) bytes += chunk.length;
    return bytes;
  }

  get(rowIndex: number, columnName: string): any {
    const column = this.#columns.get(columnName);
    // Tolerate probes for columns the query didn't select, i.e. `__class` on non-CTI queries
    if (column === undefined) return undefined;
    const base = this.#rowBase(rowIndex);
    const rows = this.#rows;
    const start = rows[base + 1];
    return this.#readCell(this.#chunks[rows[base]], start, start + rows[base + 2], column, rowIndex);
  }

  /** Materializes one row as a POJO, i.e. for debugging and differential tests; values are not cached. */
  toRow(rowIndex: number): any {
    const base = this.#rowBase(rowIndex);
    const rows = this.#rows;
    const chunk = this.#chunks[rows[base]];
    const start = rows[base + 1];
    const end = start + rows[base + 2];
    const row: Record<string, any> = {};
    let pos = start + 2;
    for (const field of this.#fields) {
      const len = this.#cellLength(chunk, pos, end, rowIndex);
      pos += 4;
      if (len === -1) {
        row[field.name] = null;
      } else {
        row[field.name] = field.decode(chunk, pos, len);
        pos += len;
      }
    }
    return row;
  }

  /** Materializes classic POJO rows, i.e. for `afterFind` observation or debugging; not cached. */
  toRows(): any[] {
    const rows = new Array(this.#rowCount);
    for (let i = 0; i < this.#rowCount; i++) rows[i] = this.toRow(i);
    return rows;
  }

  /**
   * Resolves each column's decoder from the query's RowDescription.
   *
   * `getTypeParser` resolves an oid to its active *text* parser (i.e. through the pool/client
   * `TypeOverrides` chain), defaulting to the global registry. Text-format fields decode by
   * utf8-slicing the cell into their parser; binary-format fields decode via
   * `wireBinaryParser`, which uses the text parser for fast-path eligibility and custom-parser
   * parity.
   */
  setRowDescription(
    fields: Array<{ name: string; dataTypeID: number; format?: string }>,
    getTypeParser?: (dataTypeID: number) => (value: any) => any,
  ): void {
    for (let i = 0; i < fields.length; i++) {
      const { name, dataTypeID, format } = fields[i];
      const parse = getTypeParser?.(dataTypeID) ?? pg.types.getTypeParser(dataTypeID, "text");
      const decode = format === "binary" ? wireBinaryParser(dataTypeID, parse) : textCellDecoder(parse);
      const column = { name, ordinal: i, decode };
      this.#columns.set(name, column);
      this.#fields.push(column);
    }
  }

  /**
   * Records one DataRow payload *by reference* (zero-copy); called synchronously from the wire
   * parser, whose patched buffer management guarantees the bytes are never rewritten.
   *
   * Consecutive rows usually share one socket chunk, so `bytes` is deduped against the last
   * chunk ref; retaining any row of a chunk pins the whole chunk, which `finalize`'s compaction
   * resolves by copying retained rows out when enough of the payload was dropped.
   */
  addRow(bytes: Buffer, offset: number, payloadLength: number): void {
    if (payloadLength < 2 || offset + payloadLength > bytes.length) {
      throw new Error(`Malformed DataRow payload (length ${payloadLength})`);
    }
    let chunkIndex = this.#chunks.length - 1;
    if (chunkIndex === -1 || this.#chunks[chunkIndex] !== bytes) {
      this.#chunks.push(bytes);
      chunkIndex++;
    }
    let rows = this.#rows;
    const base = this.#rowCount * ROW_STRIDE;
    if (base === rows.length) {
      const grown = new Uint32Array(rows.length * 2);
      grown.set(rows);
      rows = this.#rows = grown;
    }
    rows[base] = chunkIndex;
    rows[base + 1] = offset;
    rows[base + 2] = payloadLength;
    this.#rowCount++;
    this.#payloadBytes += payloadLength;
  }

  /** Marks `rowIndex` as retained by a hydrated entity; unmarked rows can be compacted away. */
  retain(rowIndex: number): void {
    (this.#retained ??= []).push(rowIndex);
  }

  /**
   * Trims unused capacity, and compacts down to only `retain`-ed rows when enough rows were not
   * retained to be worth the copy.
   *
   * Compaction exists to release pinned socket buffers to the GC: rows are zero-copy views into
   * whole ~64KiB chunks, so keeping any row alive pins its entire chunk — and unretained rows
   * are typically duplicates whose entities were *already in memory* (identity-map hits that
   * keep their original `rowData`), making the newly-arrived bytes dead weight. Copying the
   * retained rows into one exact-size owned buffer lets every chunk reference drop.
   *
   * The copy re-copies every retained byte, so it only pays off when it buys back a meaningful
   * fraction of the payload: we compact when the dropped rows hold more than 20% of the payload
   * bytes, and otherwise just trim, accepting the (bounded) leftover bytes. Called once after
   * hydration + sidecar reads (`_tags`, preload aggregates) are complete; retained entities keep
   * their original `rowIndex`, and un-compacted unretained rows simply remain readable-but-unused.
   */
  finalize(): void {
    const retained = this.#retained ?? [];
    this.#retained = undefined;
    if (retained.length < this.#rowCount) {
      let retainedBytes = 0;
      for (const i of retained) retainedBytes += this.#rows[i * ROW_STRIDE + 2];
      const droppedBytes = this.#payloadBytes - retainedBytes;
      if (droppedBytes > this.#payloadBytes * COMPACT_THRESHOLD) {
        this.#compact(retained, retainedBytes);
        return;
      }
    }
    // Just shrink the row-index table to its used size
    if (this.#rowCount * ROW_STRIDE < this.#rows.length) {
      this.#rows = this.#rows.slice(0, this.#rowCount * ROW_STRIDE);
    }
  }

  /** Copies retained rows into one owned buffer, releasing the pinned socket chunks to the GC. */
  #compact(retained: readonly number[], bytes: number): void {
    const chunks: Buffer[] = bytes > 0 ? [Buffer.allocUnsafe(bytes)] : [];
    const rows = new Uint32Array(this.#rowCount * ROW_STRIDE);
    for (let i = 0; i < this.#rowCount; i++) rows[i * ROW_STRIDE + 2] = DROPPED;
    let used = 0;
    for (const i of retained) {
      const base = i * ROW_STRIDE;
      const source = this.#chunks[this.#rows[base]];
      const start = this.#rows[base + 1];
      const len = this.#rows[base + 2];
      source.copy(chunks[0], used, start, start + len);
      rows[base] = 0;
      rows[base + 1] = used;
      rows[base + 2] = len;
      used += len;
    }
    this.#chunks = chunks;
    this.#rows = rows;
    this.#payloadBytes = used;
    // The scan cursor survives: its cached offsets are relative to each row's (copied) payload
  }

  /** Validates `rowIndex` and returns its base index into the `#rows` table. */
  #rowBase(rowIndex: number): number {
    if (!(rowIndex >= 0 && rowIndex < this.#rowCount)) {
      throw new Error(`Invalid rowIndex ${rowIndex} (rowCount ${this.#rowCount})`);
    }
    const base = rowIndex * ROW_STRIDE;
    if (this.#rows[base + 2] === DROPPED) {
      throw new Error(`Row ${rowIndex} was compacted away (its entity was already loaded)`);
    }
    return base;
  }

  /**
   * Scans a row's cells to `column`'s ordinal and decodes it.
   *
   * An adaptive per-row scan cursor caches the furthest cell boundary already scanned — the
   * ordinal whose row-relative offset is known (`#scanOrdinal`/`#scanOffset`) — so ascending
   * reads resume instead of re-scanning from the row start: a dense in-order read of all C
   * columns costs one linear pass rather than O(C^2) length-prefix skips. Out-of-order
   * (descending) faults simply scan from the start, i.e. never worse than without the cursor.
   * The arrays are a fixed 6 bytes/row, allocated lazily on the first fault deep enough for
   * resuming to matter, and — being row-relative — stay valid across compaction.
   */
  #readCell(chunk: Buffer, start: number, end: number, column: WireColumn, rowIndex: number): any {
    const fieldCount = chunk.readInt16BE(start);
    const { ordinal } = column;
    if (ordinal >= fieldCount) {
      throw new Error(`Row ${rowIndex} has ${fieldCount} cells but column ${column.name} is #${column.ordinal}`);
    }
    let pos = start + 2;
    let c = 0;
    let scanOrdinal = this.#scanOrdinal;
    if (scanOrdinal === undefined && ordinal >= SCAN_CURSOR_MIN_ORDINAL) {
      scanOrdinal = this.#scanOrdinal = new Uint16Array(this.#rowCount);
      this.#scanOffset = new Uint32Array(this.#rowCount);
    }
    if (scanOrdinal !== undefined && rowIndex < scanOrdinal.length) {
      // 0 = unset: caching cell #0 would be pointless (it is always at offset 2), so any real
      // entry is the ordinal, >= 1, whose row-relative offset is in #scanOffset
      const known = scanOrdinal[rowIndex];
      if (known !== 0 && known <= ordinal) {
        c = known;
        pos = start + this.#scanOffset![rowIndex];
      }
    }
    for (; c < ordinal; c++) {
      const len = this.#cellLength(chunk, pos, end, rowIndex);
      pos += len > 0 ? len + 4 : 4;
    }
    const len = this.#cellLength(chunk, pos, end, rowIndex);
    if (scanOrdinal !== undefined && rowIndex < scanOrdinal.length && ordinal + 1 > scanOrdinal[rowIndex]) {
      // advance-only: after reading cell #ordinal we know where cell #ordinal+1 starts
      scanOrdinal[rowIndex] = ordinal + 1;
      this.#scanOffset![rowIndex] = pos + 4 + (len > 0 ? len : 0) - start;
    }
    if (len === -1) return null;
    return column.decode(chunk, pos + 4, len);
  }

  /** Reads + validates one cell's length prefix. */
  #cellLength(chunk: Buffer, pos: number, end: number, rowIndex: number): number {
    if (pos + 4 > end) throw new Error(`Truncated DataRow payload in row ${rowIndex}`);
    const len = chunk.readInt32BE(pos);
    if (len < -1 || (len > 0 && pos + 4 + len > end)) {
      throw new Error(`Malformed cell length ${len} in row ${rowIndex}`);
    }
    return len;
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
 * By default the query requests *binary* result format (via the extended protocol), so scalar
 * cells decode wire-bytes -> value with no intermediate strings; see `wireBinaryParser` for the
 * parity strategy. Pass `binary: false` for classic text-format results, or set
 * `JOIST_LAZY_BINARY=0` to flip the default while the binary path is a prototype (i.e. for
 * A/B benchmarking or as an escape hatch).
 */
// The prototype escape hatch for binary results, i.e. for A/B benchmarking; read once at load
const BINARY_BY_DEFAULT = process.env.JOIST_LAZY_BINARY !== "0";

export function executeRowDataQuery(
  client: pg.PoolClient,
  sql: string,
  bindings: readonly any[],
  opts?: { binary?: boolean },
): Promise<RowData> {
  const binary = opts?.binary ?? BINARY_BY_DEFAULT;
  return new Promise((resolve, reject) => {
    const query = new RowDataQuery(
      // Binary results require the extended protocol; `queryMode` forces it for bindings-less queries
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
  // Require the pure-JS pg client (pg-native has no `connection` and different query internals)
  return (
    typeof client === "object" &&
    client !== null &&
    typeof (client as any).query === "function" &&
    (client as any).connection !== undefined &&
    (client as any).native === undefined
  );
}

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
   * go — but see the "Small results deliberately stay lazy" note on {@link WireRowData}: lazy
   * won the measured comparison at every row count for sparse access, so no threshold exists.
   */
  get rowData(): RowData {
    return this.#wire;
  }

  handleRowDescription(msg: any): void {
    if (this._canceledDueToError) return;
    try {
      super.handleRowDescription(msg);
      // Resolve active *text* parsers through the client's TypeOverrides chain (client.js
      // injects `_types` at submit time); we can't reuse `Result._parsers` because in binary
      // mode those resolve to pg's (broken) binary registry, while our binary decode path is
      // built on text-parser parity — see `wireBinaryParser`
      const types = this._result?._types;
      this.#wire.setRowDescription(msg.fields, types && ((oid: number) => types.getTypeParser(oid, "text")));
    } catch (err) {
      // Mirror pg's Query error containment: record + reject at ReadyForQuery, keeping the
      // connection's protocol state intact
      this._canceledDueToError = err;
    }
  }

  handleDataRow(msg: any): void {
    if (this._canceledDueToError) return;
    try {
      if (msg.bytes === undefined) {
        // This connection's pg-protocol copy is unpatched (i.e. the pool came from a different
        // `pg` install than the one joist-orm patched), so lazyRows cannot work — fail loudly
        // rather than silently degrade; any CI build/smoketest will surface this immediately
        throw new Error(
          "joist-orm: lazyRows is enabled, but this connection's pg-protocol emits classic" +
            " DataRows (likely a duplicate pg install); fix the install or disable lazyRows.",
        );
      }
      // `msg.length` includes the int32 length field itself, so the payload is `length - 4`;
      // our patched message carries the real length from `handlePacket`'s argument
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
