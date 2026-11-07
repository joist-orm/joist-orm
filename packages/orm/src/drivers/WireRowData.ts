import type { RowData } from "joist-core";

/** One column's RowDescription-derived metadata, resolved once per query. */
type WireColumn = {
  name: string;
  ordinal: number;
  /** Decodes this column's cell bytes to its value; supplied by the selected driver. */
  decode: (chunk: Buffer, start: number, length: number) => any;
};

// Each row is three consecutive entries in the `#rowSlices` table: chunk index, start, length
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
 * Rows are kept in their row-major wire format (optional `int16 fieldCount` + length-prefixed cells) as
 * zero-copy views over the parser's own immutable buffers: `addRow` records each DataRow's
 * `(bytes, offset, length)` by reference, deduping the socket chunk that consecutive rows
 * share. The selected driver guarantees immutable bytes: node-pg through `patchPgProtocol.ts`,
 * PostgreJS through its public RowDecoder contract. A
 * `row × column` cell is decoded on first field access by scanning the row's length-prefixed
 * cells to the column's ordinal ("row-lazy" decode, see JS-ROW-STORE-DESIGN.md §3/C2). This is
 * deferred decoding of row-major data, not a columnar layout.
 *
 * Because chunks are whole socket reads, retaining any row pins its ~64KiB chunk (plus whatever
 * protocol frames share it); `finalize`'s compaction copies retained rows out into an
 * exact-size owned buffer when enough of the payload was dropped.
 *
 * Column decoders come from the selected driver through `setColumnDecoders`. RowDataQuery
 * resolves node-pg text fields through TypeOverrides and binary fields through Joist's binary
 * registry. PostgreJsDriver supplies its native parsers, bypassing pg's parser resolution.
 * (Classic node-postgres cannot safely decode binary cells: it round-trips
 * them through a UTF-8 string, corrupting bytes >= 0x80.)
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
  /** PostgreJS omits the int16 field count from the immutable row view it exposes. */
  constructor(private readonly rowHeaderBytes: 0 | 2 = 2) {}

  /** Installs decoders supplied by a driver with a public raw-row API. */
  setColumnDecoders(fields: Array<{ name: string; decode: WireColumn["decode"] }>): void {
    this.#fields = fields.map((field, ordinal) => ({ ...field, ordinal }));
    this.#columns = new Map(this.#fields.map((field) => [field.name, field]));
  }

  #chunks: Buffer[] = [];
  /** Where each row's bytes live: `(chunk index, start, length)` slices, `ROW_STRIDE` entries per row. */
  #rowSlices: Uint32Array<ArrayBufferLike> = new Uint32Array(16 * ROW_STRIDE);
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

  /** The bytes currently held by payload chunks + the row-slice table, i.e. for benchmarks. */
  get memoryBytes(): number {
    let bytes = this.#rowSlices.byteLength;
    for (const chunk of this.#chunks) bytes += chunk.length;
    return bytes;
  }

  has(rowIndex: number, columnName: string): boolean {
    return this.#columns.has(columnName);
  }

  get(rowIndex: number, columnName: string): any {
    const column = this.#columns.get(columnName);
    // Tolerate probes for columns the query didn't select, i.e. `__class` on non-CTI queries
    if (column === undefined) return undefined;
    const base = this.#rowBase(rowIndex);
    const slices = this.#rowSlices;
    const start = slices[base + 1];
    return this.#readCell(this.#chunks[slices[base]], start, start + slices[base + 2], column, rowIndex);
  }

  /** Materializes one row as a POJO, i.e. for debugging and differential tests; values are not cached. */
  toRow(rowIndex: number): any {
    const base = this.#rowBase(rowIndex);
    const slices = this.#rowSlices;
    const chunk = this.#chunks[slices[base]];
    const start = slices[base + 1];
    const end = start + slices[base + 2];
    const row: Record<string, any> = {};
    let pos = start + this.rowHeaderBytes;
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
   * Records one DataRow payload *by reference* (zero-copy); called synchronously from the wire
   * parser, whose buffer ownership contract guarantees the bytes are never rewritten.
   *
   * Consecutive rows usually share one socket chunk, so `bytes` is deduped against the last
   * chunk ref; retaining any row of a chunk pins the whole chunk, which `finalize`'s compaction
   * resolves by copying retained rows out when enough of the payload was dropped.
   */
  addRow(bytes: Buffer, offset: number, payloadLength: number): void {
    if (payloadLength < this.rowHeaderBytes || offset + payloadLength > bytes.length) {
      throw new Error(`Malformed DataRow payload (length ${payloadLength})`);
    }
    let chunkIndex = this.#chunks.length - 1;
    if (chunkIndex === -1 || this.#chunks[chunkIndex] !== bytes) {
      this.#chunks.push(bytes);
      chunkIndex++;
    }
    let slices = this.#rowSlices;
    const base = this.#rowCount * ROW_STRIDE;
    if (base === slices.length) {
      const grown = new Uint32Array(slices.length * 2);
      grown.set(slices);
      slices = this.#rowSlices = grown;
    }
    slices[base] = chunkIndex;
    slices[base + 1] = offset;
    slices[base + 2] = payloadLength;
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
      for (const i of retained) retainedBytes += this.#rowSlices[i * ROW_STRIDE + 2];
      const droppedBytes = this.#payloadBytes - retainedBytes;
      if (droppedBytes > this.#payloadBytes * COMPACT_THRESHOLD) {
        this.#compact(retained, retainedBytes);
        return;
      }
    }
    // Just shrink the row-slice table to its used size
    if (this.#rowCount * ROW_STRIDE < this.#rowSlices.length) {
      this.#rowSlices = this.#rowSlices.slice(0, this.#rowCount * ROW_STRIDE);
    }
  }

  /** Copies retained rows into one owned buffer, releasing the pinned socket chunks to the GC. */
  #compact(retained: readonly number[], bytes: number): void {
    const chunks: Buffer[] = bytes > 0 ? [Buffer.allocUnsafe(bytes)] : [];
    const slices = new Uint32Array(this.#rowCount * ROW_STRIDE);
    for (let i = 0; i < this.#rowCount; i++) slices[i * ROW_STRIDE + 2] = DROPPED;
    let used = 0;
    for (const i of retained) {
      const base = i * ROW_STRIDE;
      const source = this.#chunks[this.#rowSlices[base]];
      const start = this.#rowSlices[base + 1];
      const len = this.#rowSlices[base + 2];
      source.copy(chunks[0], used, start, start + len);
      slices[base] = 0;
      slices[base + 1] = used;
      slices[base + 2] = len;
      used += len;
    }
    this.#chunks = chunks;
    this.#rowSlices = slices;
    this.#payloadBytes = used;
    // The scan cursor survives: its cached offsets are relative to each row's (copied) payload
  }

  /** Validates `rowIndex` and returns its base index into the `#rowSlices` table. */
  #rowBase(rowIndex: number): number {
    if (!(rowIndex >= 0 && rowIndex < this.#rowCount)) {
      throw new Error(`Invalid rowIndex ${rowIndex} (rowCount ${this.#rowCount})`);
    }
    const base = rowIndex * ROW_STRIDE;
    if (this.#rowSlices[base + 2] === DROPPED) {
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
    const fieldCount = this.rowHeaderBytes === 2 ? chunk.readInt16BE(start) : this.#fields.length;
    const { ordinal } = column;
    if (ordinal >= fieldCount) {
      throw new Error(`Row ${rowIndex} has ${fieldCount} cells but column ${column.name} is #${column.ordinal}`);
    }
    let pos = start + this.rowHeaderBytes;
    let c = 0;
    let scanOrdinal = this.#scanOrdinal;
    if (scanOrdinal === undefined && ordinal >= SCAN_CURSOR_MIN_ORDINAL) {
      scanOrdinal = this.#scanOrdinal = new Uint16Array(this.#rowCount);
      this.#scanOffset = new Uint32Array(this.#rowCount);
    }
    if (scanOrdinal !== undefined && rowIndex < scanOrdinal.length) {
      // 0 = unset: caching cell #0 would be pointless (it is always at rowHeaderBytes), so any real
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
