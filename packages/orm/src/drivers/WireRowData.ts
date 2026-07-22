import { PojoRowData, RowData } from "joist-core";
import pg from "pg";

// pg's internal-but-exported Query class; subclassing it reuses its extended-protocol
// submit/bind logic while letting us intercept row handling (the same seam pg-cursor uses).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PgQuery: any = require("pg/lib/query");

/** One column's RowDescription-derived metadata, resolved once per query. */
type WireColumn = { name: string; ordinal: number; parse: (value: any) => any; binary: boolean };

/** Payload chunk size; rows larger than this get their own exact-size chunk. */
const CHUNK_SIZE = 64 * 1024;

/** The `#rowLen` sentinel for rows dropped by `finalize` compaction. */
const DROPPED = 0xffffffff;

/** Only compact when dropped rows hold more than this fraction of the payload bytes. */
const COMPACT_THRESHOLD = 0.2;

/**
 * A lazy wire-row {@link RowData} over raw Postgres `DataRow` payload bytes.
 *
 * Each query produces its own `WireRowData` — one query, one result; results are never combined
 * or appended across queries, and the payload is read-only after the query completes (entity
 * mutations go into `InstanceData.data`, never back into the row bytes).
 *
 * Rows are kept in their row-major wire format (`int16 fieldCount` + length-prefixed cells) in
 * lazily-allocated fixed-size chunks (oversized rows get a dedicated exact-size chunk), and a
 * `row × column` cell is decoded on first field access by scanning the row's length-prefixed
 * cells to the column's ordinal ("row-lazy" decode, see JS-ROW-STORE-DESIGN.md §3/C2). This is
 * deferred decoding of row-major data, not a columnar layout.
 *
 * Cell values go through the same type parsers node-postgres itself resolved for the query
 * (i.e. honoring pool/client/query `TypeOverrides` and each field's text/binary format), so
 * text cells parse identically to classic rows. Binary cells are passed to the binary parser
 * as an exact byte slice — note classic node-postgres round-trips binary cells through a UTF-8
 * string (`Buffer.from(utf8String)`), which corrupts bytes >= 0x80, so lazy mode is byte-exact
 * where classic mode can be lossy.
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
 * materialization eagerly decodes every column while lazy faults only what is read. The winner
 * flips on column *coverage*, not row count: reading all 40 columns favors materialized rows
 * ~1.6x at any size — but that access pattern is unknowable up-front, and at small n the dense
 * penalty (~2µs/row) is invisible under the ~500µs query round-trip. End-to-end, small finds
 * (n <= 10) measured statistically identical in both modes.
 */
export class WireRowData implements RowData {
  #chunks: Buffer[] = [];
  /** The index of the partial fixed-size chunk we're filling, or -1 (oversized chunks are exact). */
  #currentChunk = -1;
  #currentUsed = 0;
  #rowChunk: Uint32Array<ArrayBufferLike> = new Uint32Array(16);
  #rowStart: Uint32Array<ArrayBufferLike> = new Uint32Array(16);
  #rowLen: Uint32Array<ArrayBufferLike> = new Uint32Array(16);
  #rowCount = 0;
  #payloadBytes = 0;
  #retained: number[] | undefined = undefined;
  #columns: Map<string, WireColumn> = new Map();
  #fields: WireColumn[] = [];

  get rowCount(): number {
    return this.#rowCount;
  }

  /** The total DataRow payload bytes appended (before any compaction). */
  get payloadBytes(): number {
    return this.#payloadBytes;
  }

  /** The bytes currently retained by payload chunks + row-index tables, i.e. for benchmarks. */
  get retainedBytes(): number {
    let bytes = this.#rowChunk.byteLength + this.#rowStart.byteLength + this.#rowLen.byteLength;
    for (const chunk of this.#chunks) bytes += chunk.length;
    return bytes;
  }

  get(rowIndex: number, columnName: string): any {
    const column = this.#columns.get(columnName);
    // Tolerate probes for columns the query didn't select, i.e. `__class` on non-CTI queries
    if (column === undefined) return undefined;
    const [chunk, pos, end] = this.#rowBounds(rowIndex);
    return this.#readCell(chunk, pos, end, column, rowIndex);
  }

  /** Materializes one row as a POJO, i.e. for legacy serdes or debugging; values are not cached. */
  toRow(rowIndex: number): any {
    const [chunk, start, end] = this.#rowBounds(rowIndex);
    const row: Record<string, any> = {};
    let pos = start + 2;
    for (const field of this.#fields) {
      const len = this.#cellLength(chunk, pos, end, rowIndex);
      pos += 4;
      if (len === -1) {
        row[field.name] = null;
      } else {
        row[field.name] = this.#parseCell(chunk, pos, len, field);
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
   * Resolves per-column parsers/formats from the query's RowDescription.
   *
   * `parsers` is node-postgres's own `Result._parsers` array (computed by
   * `Result.addFields` from the active pool/client/query `TypeOverrides` and each field's
   * format); we fall back to the global registry if a future pg version reshapes it.
   */
  setRowDescription(fields: Array<{ name: string; dataTypeID: number; format?: string }>, parsers?: any[]): void {
    for (let i = 0; i < fields.length; i++) {
      const { name, dataTypeID, format } = fields[i];
      const binary = format === "binary";
      const parse = parsers?.[i] ?? pg.types.getTypeParser(dataTypeID, binary ? "binary" : "text");
      const column = { name, ordinal: i, parse, binary };
      this.#columns.set(name, column);
      this.#fields.push(column);
    }
  }

  /** Copies one DataRow payload into a chunk; called synchronously from the wire parser. */
  appendRow(bytes: Buffer, offset: number, payloadLength: number): void {
    if (payloadLength < 2 || offset + payloadLength > bytes.length) {
      throw new Error(`Malformed DataRow payload (length ${payloadLength})`);
    }
    if (payloadLength > CHUNK_SIZE) {
      // Oversized rows get a dedicated exact-size chunk; the current partial chunk (if any)
      // keeps filling with subsequent rows, since each row records its own chunk index
      const dedicated = Buffer.allocUnsafe(payloadLength);
      bytes.copy(dedicated, 0, offset, offset + payloadLength);
      this.#chunks.push(dedicated);
      this.#pushRow(this.#chunks.length - 1, 0, payloadLength);
    } else {
      if (this.#currentChunk === -1 || this.#currentUsed + payloadLength > CHUNK_SIZE) {
        this.#chunks.push(Buffer.allocUnsafe(CHUNK_SIZE));
        this.#currentChunk = this.#chunks.length - 1;
        this.#currentUsed = 0;
      }
      const start = this.#currentUsed;
      bytes.copy(this.#chunks[this.#currentChunk], start, offset, offset + payloadLength);
      this.#currentUsed = start + payloadLength;
      this.#pushRow(this.#currentChunk, start, payloadLength);
    }
    this.#payloadBytes += payloadLength;
  }

  /** Marks `rowIndex` as retained by a hydrated entity; unmarked rows can be compacted away. */
  retain(rowIndex: number): void {
    (this.#retained ??= []).push(rowIndex);
  }

  /**
   * Trims unused capacity, and compacts down to only `retain`-ed rows when enough rows were not
   * retained (i.e. duplicate rows whose entities were already loaded) to be worth the copy.
   *
   * Compaction re-copies every retained byte, so it only pays off when it buys back a meaningful
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
      for (const i of retained) retainedBytes += this.#rowLen[i];
      const droppedBytes = this.#payloadBytes - retainedBytes;
      if (droppedBytes > this.#payloadBytes * COMPACT_THRESHOLD) {
        this.#compact(retained, retainedBytes);
        return;
      }
    }
    this.#trim();
  }

  /** Rebuilds chunks with only the retained rows; dropped rows read as errors afterwards. */
  #compact(retained: readonly number[], bytes: number): void {
    const chunks: Buffer[] = bytes > 0 ? [Buffer.allocUnsafe(bytes)] : [];
    const rowChunk = new Uint32Array(this.#rowCount);
    const rowStart = new Uint32Array(this.#rowCount);
    const rowLen = new Uint32Array(this.#rowCount).fill(DROPPED);
    let used = 0;
    for (const i of retained) {
      const source = this.#chunks[this.#rowChunk[i]];
      const start = this.#rowStart[i];
      const len = this.#rowLen[i];
      source.copy(chunks[0], used, start, start + len);
      rowStart[i] = used;
      rowLen[i] = len;
      used += len;
    }
    this.#chunks = chunks;
    this.#currentChunk = -1;
    this.#currentUsed = 0;
    this.#rowChunk = rowChunk;
    this.#rowStart = rowStart;
    this.#rowLen = rowLen;
    this.#payloadBytes = used;
  }

  /** Shrinks the partial chunk + row-index tables to their used sizes. */
  #trim(): void {
    const partial = this.#currentChunk;
    if (partial !== -1 && this.#currentUsed < this.#chunks[partial].length) {
      const exact = Buffer.allocUnsafe(this.#currentUsed);
      this.#chunks[partial].copy(exact, 0, 0, this.#currentUsed);
      this.#chunks[partial] = exact;
    }
    this.#currentChunk = -1;
    if (this.#rowCount < this.#rowChunk.length) {
      this.#rowChunk = this.#rowChunk.slice(0, this.#rowCount);
      this.#rowStart = this.#rowStart.slice(0, this.#rowCount);
      this.#rowLen = this.#rowLen.slice(0, this.#rowCount);
    }
  }

  /** Records one row's location, growing the index tables as needed. */
  #pushRow(chunkIndex: number, start: number, length: number): void {
    if (this.#rowCount === this.#rowChunk.length) {
      const grown = this.#rowChunk.length * 2;
      this.#rowChunk = growUint32(this.#rowChunk, grown);
      this.#rowStart = growUint32(this.#rowStart, grown);
      this.#rowLen = growUint32(this.#rowLen, grown);
    }
    this.#rowChunk[this.#rowCount] = chunkIndex;
    this.#rowStart[this.#rowCount] = start;
    this.#rowLen[this.#rowCount] = length;
    this.#rowCount++;
  }

  /** Validates `rowIndex` and returns its chunk + payload bounds. */
  #rowBounds(rowIndex: number): [Buffer, number, number] {
    if (!(rowIndex >= 0 && rowIndex < this.#rowCount)) {
      throw new Error(`Invalid rowIndex ${rowIndex} (rowCount ${this.#rowCount})`);
    }
    const len = this.#rowLen[rowIndex];
    if (len === DROPPED) {
      throw new Error(`Row ${rowIndex} was compacted away (its entity was already loaded)`);
    }
    const start = this.#rowStart[rowIndex];
    return [this.#chunks[this.#rowChunk[rowIndex]], start, start + len];
  }

  /** Scans a row's cells to `column`'s ordinal and decodes it. */
  #readCell(chunk: Buffer, start: number, end: number, column: WireColumn, rowIndex: number): any {
    const fieldCount = chunk.readInt16BE(start);
    if (column.ordinal >= fieldCount) {
      throw new Error(`Row ${rowIndex} has ${fieldCount} cells but column ${column.name} is #${column.ordinal}`);
    }
    let pos = start + 2;
    const { ordinal } = column;
    for (let c = 0; c < ordinal; c++) {
      const len = this.#cellLength(chunk, pos, end, rowIndex);
      pos += len > 0 ? len + 4 : 4;
    }
    const len = this.#cellLength(chunk, pos, end, rowIndex);
    if (len === -1) return null;
    return this.#parseCell(chunk, pos + 4, len, column);
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

  /** Decodes one cell through its column's parser, honoring text vs binary format. */
  #parseCell(chunk: Buffer, start: number, length: number, column: WireColumn): any {
    if (column.binary) {
      // Binary parsers take Buffers; copy the exact cell bytes (classic pg round-trips through a
      // utf8 string here, which corrupts bytes >= 0x80 — we are byte-exact instead)
      const cell = Buffer.allocUnsafe(length);
      chunk.copy(cell, 0, start, start + length);
      return column.parse(cell);
    }
    return column.parse(chunk.toString("utf8", start, start + length));
  }
}

/**
 * Executes `sql` on an already-checked-out client, returning a {@link RowData} instead of
 * materialized POJO rows.
 *
 * Uses a `pg` Query subclass that appends each DataRow's raw payload bytes to the result's
 * chunks (via the lazy DataRow message from `patchPgProtocol`) and never materializes per-cell
 * strings or per-row objects. If the client's connection turns out to use an unpatched
 * pg-protocol copy (i.e. the app's pool was built from a different `pg` install than the one
 * joist-orm patched), the same query degrades in-flight to classic decoded rows wrapped in a
 * `PojoRowData` — the query is never re-executed.
 */
export function executeRowDataQuery(client: pg.PoolClient, sql: string, bindings: readonly any[]): Promise<RowData> {
  return new Promise((resolve, reject) => {
    const query = new RowDataQuery({ text: sql, values: bindings as any[] }, (err: unknown) => {
      if (err) reject(err);
      else resolve(query.rowData);
    });
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
  #fallbackRows: any[] | undefined = undefined;
  #fields: Array<{ name: string }> = [];

  constructor(config: { text: string; values: any[] }, callback: (err: unknown) => void) {
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
    return this.#fallbackRows ? new PojoRowData(this.#fallbackRows) : this.#wire;
  }

  handleRowDescription(msg: any): void {
    if (this._canceledDueToError) return;
    try {
      super.handleRowDescription(msg);
      this.#fields = msg.fields;
      // Reuse the parsers Result.addFields just resolved (they honor pool/client TypeOverrides)
      this.#wire.setRowDescription(msg.fields, this._result?._parsers);
    } catch (err) {
      // Mirror pg's Query error containment: record + reject at ReadyForQuery, keeping the
      // connection's protocol state intact
      this._canceledDueToError = err;
    }
  }

  handleDataRow(msg: any): void {
    if (this._canceledDueToError) return;
    try {
      if (msg.bytes !== undefined) {
        // `msg.length` includes the int32 length field itself, so the payload is `length - 4`;
        // 1.15+ reports length lazily as -1, in which case our lazy message carries the real one
        this.#wire.appendRow(msg.bytes, msg.offset, msg.length - 4);
      } else {
        // This connection's pg-protocol copy is unpatched (i.e. the pool came from a different
        // `pg` install), so consume the classic decoded fields of this same query — no retry
        warnUnpatchedOnce();
        const row: Record<string, any> = {};
        const { fields } = msg;
        for (let i = 0; i < this.#fields.length; i++) {
          const value = fields[i];
          row[this.#fields[i].name] = value === null ? null : this._result._parsers[i](value);
        }
        (this.#fallbackRows ??= []).push(row);
      }
    } catch (err) {
      this._canceledDueToError = err;
    }
  }
}

let warnedUnpatched = false;

/** Warns once if lazy rows silently degrade because the app's pg uses an unpatched pg-protocol. */
function warnUnpatchedOnce(): void {
  if (warnedUnpatched) return;
  warnedUnpatched = true;
  console.warn(
    "joist-orm: lazyRows is enabled, but this connection's pg-protocol emits classic DataRows" +
      " (likely a duplicate pg install); falling back to materialized rows.",
  );
}

/** Grows a Uint32Array to `size`, copying existing entries. */
function growUint32(array: Uint32Array, size: number): Uint32Array {
  const grown = new Uint32Array(size);
  grown.set(array);
  return grown;
}
