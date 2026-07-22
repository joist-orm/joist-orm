import { PojoRowData, RowData } from "joist-core";
import pg from "pg";

// pg's internal-but-exported Query class; subclassing it reuses its extended-protocol
// submit/bind logic while letting us intercept row handling (the same seam pg-cursor uses).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PgQuery: any = require("pg/lib/query");

/** One column's RowDescription-derived metadata, resolved once per query. */
type WireColumn = { ordinal: number; parse: (value: string) => any };

/**
 * A lazy, columnar {@link RowData} over raw Postgres `DataRow` wire bytes.
 *
 * Each query produces its own `WireRowData` — one query, one arena; results are never combined
 * or appended across queries, and the arena is read-only after the query completes (entity
 * mutations go into `InstanceData.data`, never back into the row bytes). The whole result is
 * freed together once no entity references it.
 *
 * Rows are kept as-is in a single off-V8-heap arena `Buffer` (the payload is
 * `int16 fieldCount` + length-prefixed cells, exactly the wire format); we record only a
 * `rowStart` offset per row, and a `row × column` cell is decoded on first field access by
 * scanning the row's length-prefixed cells to the column's ordinal ("row-lazy" decode, see
 * JS-ROW-STORE-DESIGN.md §3/C2). Decoded values still go through the pg-types parser for the
 * column's oid, so global type-parser configuration (i.e. `setupLatestPgTypes`) is honored.
 */
export class WireRowData implements RowData {
  #arena: Buffer = Buffer.allocUnsafe(256 * 1024);
  #arenaLength = 0;
  #rowStarts = new Uint32Array(1024);
  #rowCount = 0;
  #columns: Map<string, WireColumn> = new Map();
  #fields: Array<{ name: string; parse: (value: string) => any }> = [];

  get rowCount(): number {
    return this.#rowCount;
  }

  get(rowIndex: number, columnName: string): any {
    const column = this.#columns.get(columnName);
    // Tolerate probes for columns the query didn't select, i.e. `__class` on non-CTI queries
    if (column === undefined) return undefined;
    const arena = this.#arena;
    // Skip the int16 fieldCount, then scan the length-prefixed cells to our ordinal
    let pos = this.#rowStarts[rowIndex] + 2;
    const { ordinal } = column;
    for (let c = 0; c < ordinal; c++) {
      const len = arena.readInt32BE(pos);
      pos += len > 0 ? len + 4 : 4;
    }
    const len = arena.readInt32BE(pos);
    if (len === -1) return null;
    return column.parse(arena.toString("utf8", pos + 4, pos + 4 + len));
  }

  /** Resolves each column's ordinal + pg-types parser from the query's RowDescription. */
  setRowDescription(fields: Array<{ name: string; dataTypeID: number }>): void {
    for (let i = 0; i < fields.length; i++) {
      const parse = pg.types.getTypeParser(fields[i].dataTypeID, "text");
      this.#columns.set(fields[i].name, { ordinal: i, parse });
      this.#fields.push({ name: fields[i].name, parse });
    }
  }

  /** Applies the `ordinal`-th column's pg-types parser, i.e. for the unpatched-copy fallback path. */
  parseValue(ordinal: number, text: string): any {
    return this.#fields[ordinal].parse(text);
  }

  toRows(): any[] {
    const rows = new Array(this.#rowCount);
    const arena = this.#arena;
    const fields = this.#fields;
    for (let i = 0; i < this.#rowCount; i++) {
      const row: Record<string, any> = {};
      let pos = this.#rowStarts[i] + 2;
      for (const { name, parse } of fields) {
        const len = arena.readInt32BE(pos);
        pos += 4;
        if (len === -1) {
          row[name] = null;
        } else {
          row[name] = parse(arena.toString("utf8", pos, pos + len));
          pos += len;
        }
      }
      rows[i] = row;
    }
    return rows;
  }

  /** Copies one DataRow payload into the arena; called synchronously from the wire parser. */
  appendRow(bytes: Buffer, offset: number, payloadLength: number): void {
    let arena = this.#arena;
    const needed = this.#arenaLength + payloadLength;
    if (needed > arena.length) {
      const grown = Buffer.allocUnsafe(Math.max(arena.length * 2, needed));
      arena.copy(grown, 0, 0, this.#arenaLength);
      this.#arena = arena = grown;
    }
    if (this.#rowCount === this.#rowStarts.length) {
      const grown = new Uint32Array(this.#rowStarts.length * 2);
      grown.set(this.#rowStarts);
      this.#rowStarts = grown;
    }
    bytes.copy(arena, this.#arenaLength, offset, offset + payloadLength);
    this.#rowStarts[this.#rowCount++] = this.#arenaLength;
    this.#arenaLength = needed;
  }
}

/**
 * Executes `sql` returning a {@link RowData} instead of materialized POJO rows.
 *
 * Uses a `pg` Query subclass that appends each DataRow's raw payload bytes to the result's
 * arena (via the lazy DataRow message from `patchPgProtocol`) and never materializes per-cell
 * strings or per-row objects. If the client's connection turns out to use an unpatched
 * pg-protocol copy (i.e. the app's pool was built from a different `pg` install than the one
 * joist-orm patched), we degrade to classic decoded rows wrapped in a `PojoRowData`.
 */
export async function executeRowDataQuery(
  clientOrPool: pg.Pool | pg.PoolClient,
  sql: string,
  bindings: readonly any[],
): Promise<RowData> {
  // pg-pool rejects Submittables in `pool.query`, so check out a client explicitly
  if (clientOrPool instanceof pg.Pool) {
    const client = await clientOrPool.connect();
    try {
      return await submitRowDataQuery(client, sql, bindings);
    } finally {
      client.release();
    }
  }
  return submitRowDataQuery(clientOrPool, sql, bindings);
}

/** Submits a RowDataQuery on an already-checked-out client. */
function submitRowDataQuery(client: pg.PoolClient, sql: string, bindings: readonly any[]): Promise<RowData> {
  return new Promise((resolve, reject) => {
    const query = new RowDataQuery({ text: sql, values: bindings as any[] }, (err: unknown) => {
      if (err) reject(err);
      else resolve(query.rowData);
    });
    client.query(query as any);
  });
}

/** A pg Query that diverts DataRows into a {@link WireRowData} instead of a `Result`. */
class RowDataQuery extends PgQuery {
  #wire = new WireRowData();
  #fallbackRows: any[] | undefined = undefined;
  #fields: Array<{ name: string }> = [];

  constructor(config: { text: string; values: any[] }, callback: (err: unknown) => void) {
    super(config, undefined, callback);
  }

  /** The query's result rows, i.e. once our callback has fired. */
  get rowData(): RowData {
    return this.#fallbackRows ? new PojoRowData(this.#fallbackRows) : this.#wire;
  }

  handleRowDescription(msg: any): void {
    super.handleRowDescription(msg);
    this.#fields = msg.fields;
    this.#wire.setRowDescription(msg.fields);
  }

  handleDataRow(msg: any): void {
    if (msg.bytes !== undefined) {
      // `msg.length` includes the int32 length field itself, so the payload is `length - 4`
      this.#wire.appendRow(msg.bytes, msg.offset, msg.length - 4);
    } else {
      // This connection's pg-protocol copy is unpatched (i.e. the pool came from a different
      // `pg` install than the one we patched), so fall back to classic decoded rows
      warnUnpatchedOnce();
      const row: Record<string, any> = {};
      const { fields } = msg;
      for (let i = 0; i < this.#fields.length; i++) {
        const value = fields[i];
        row[this.#fields[i].name] = value === null ? null : this.#wire.parseValue(i, value);
      }
      (this.#fallbackRows ??= []).push(row);
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
