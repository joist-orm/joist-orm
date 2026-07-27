import { getInstanceData } from "joist-orm";
import { ensureLazyDataRows, executeRowDataQuery, WireRowData } from "joist-orm/pg";
import pg from "pg";
import { Author } from "src/entities";
import { insertAuthor } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

const connectionString = process.env.DATABASE_URL ?? "postgres://joist:local@localhost:5435/joist";

/**
 * Focused tests for the lazy wire-row `RowData` (see JS-ROW-STORE-DESIGN.md), i.e. the
 * protocol/format/boundary behavior that the broad entity-level integration suite can't isolate.
 */
describe("WireRowData", () => {
  let pool: pg.Pool;

  beforeAll(() => {
    expect(ensureLazyDataRows()).toBe(true);
    pool = new pg.Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  /** Runs `sql` through both the classic and lazy paths on the same pool. */
  async function classicAndLazy(sql: string, bindings: any[] = []): Promise<[any[], WireRowData]> {
    const classic = (await pool.query(sql, bindings)).rows;
    const client = await pool.connect();
    try {
      const lazy = await executeRowDataQuery(client, sql, bindings);
      return [classic, lazy as WireRowData];
    } finally {
      client.release();
    }
  }

  describe("type parity with classic rows", () => {
    it("decodes the scalar/json/array/temporal type zoo identically", async () => {
      const sql = `
        select
          1234 as int_col,
          9007199254740993::int8 as int8_col,
          12.34::numeric as numeric_col,
          2.5::float8 as float_col,
          true as bool_col,
          'plain' as text_col,
          '' as empty_col,
          'wörld 亜' as utf8_col,
          null::text as null_col,
          '{"a": ["b", 2]}'::jsonb as jsonb_col,
          array[1, 2, 3] as int_array_col,
          array['a', null, 'c']::text[] as text_array_col,
          '2020-01-02'::date as date_col,
          '2020-01-02T03:04:05.678Z'::timestamptz as tstz_col,
          '\\xdeadbeef'::bytea as bytea_col,
          'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid as uuid_col
      `;
      const [classic, lazy] = await classicAndLazy(sql);
      expect(lazy.rowCount).toBe(1);
      expect(lazy.toRows()).toEqual(classic);
      // And per-cell gets match the row-materialized values
      for (const key of Object.keys(classic[0])) {
        expect(lazy.get(0, key)).toEqual(classic[0][key]);
      }
    });

    it("honors pool-level custom type parsers", async () => {
      // Use a dedicated pool with a custom int4 parser (the review's bypass repro)
      const customPool = new pg.Pool({
        connectionString,
        types: {
          getTypeParser: (oid: number, format?: any) =>
            oid === pg.types.builtins.INT4 ? (value: string) => `custom:${value}` : pg.types.getTypeParser(oid, format),
        } as any,
      });
      try {
        const classic = (await customPool.query("select 7::int4 as x")).rows[0].x;
        const client = await customPool.connect();
        try {
          const lazy = await executeRowDataQuery(client, "select 7::int4 as x", []);
          expect(classic).toBe("custom:7");
          expect(lazy.get(0, "x")).toBe("custom:7");
        } finally {
          client.release();
        }
      } finally {
        await customPool.end();
      }
    });

    it("decodes binary-format cells via the wire-bytes fast path", () => {
      // Unit-level: an int4 cell with a default parser decodes readInt32BE, no strings involved
      const rowData = new WireRowData();
      rowData.setRowDescription([{ name: "x", dataTypeID: pg.types.builtins.INT4, format: "binary" }]);
      rowData.addRow(dataRowPayload([Buffer.from([0, 0, 0, 7])]), 0, 4 + 4 + 2);
      expect(rowData.get(0, "x")).toBe(7);
    });

    it("decodes binary values that classic pg's binary mode corrupts", async () => {
      // Cells with bytes >= 0x80 are destroyed by classic pg's utf8 round-trip (result.js
      // Buffer.from(string)); our binary path reads the exact wire bytes, so these must all
      // match the classic *text*-format values
      const sql = `
        select
          200::int4 as high_byte,
          (-1)::int4 as neg,
          (-32768)::int2 as neg2,
          9007199254740993::int8 as big,
          0.1::float4 as f4,
          -1.5::float8 as f8,
          'NaN'::numeric as nan,
          12.340::numeric as trailing_scale,
          0.0001::numeric as small_scale,
          '2020-01-02T03:04:05.678Z'::timestamptz as tstz,
          '2020-06-15T00:00:00Z'::timestamptz as tstz_whole,
          '2020-01-02T03:04:05.678901Z'::timestamptz as tstz_micros,
          '1969-06-01T12:30:45.5Z'::timestamptz as tstz_pre_epoch,
          '1955-11-05'::date as date_pre_epoch,
          '0080-02-29'::date as date_two_digit_year,
          array[-1, null, 200]::int4[] as neg_array,
          to_tsvector('english', 'The Brand New Worlds') as tsv,
          tstzrange('2020-01-02T03:04:05Z', '2020-01-03T00:00:00Z', '[)') as tsrange
      `;
      const [classic, lazy] = await classicAndLazy(sql);
      expect(lazy.toRow(0)).toEqual(classic[0]);
    });
  });

  describe("boundaries and validation", () => {
    it("handles zero-row results with minimal retention", async () => {
      const [, lazy] = await classicAndLazy("select 1 as x where false");
      lazy.finalize();
      expect(lazy.rowCount).toBe(0);
      expect(lazy.payloadBytes).toBe(0);
      expect(lazy.retainedBytes).toBe(0);
    });

    it("retains roughly one response chunk for a one-row result after finalize", async () => {
      const [, lazy] = await classicAndLazy("select 'hello' as x");
      lazy.retain?.(0);
      lazy.finalize();
      expect(lazy.payloadBytes).toBeLessThan(64);
      // Adoption pins the response's whole socket chunk (protocol frames included) — small for
      // a small query — plus tiny index tables; nothing like the old fixed 256 KiB arena
      expect(lazy.retainedBytes).toBeLessThan(1024);
      expect(lazy.get(0, "x")).toBe("hello");
    });

    it("dedupes consecutive rows sharing an adopted chunk", () => {
      const rowData = new WireRowData();
      rowData.setRowDescription([{ name: "x", dataTypeID: pg.types.builtins.TEXT }], [(value: string) => value]);
      // Three rows inside one buffer (like one socket chunk), plus one from a second buffer
      const payloads = [textPayload("row0"), textPayload("row1"), textPayload("row2")];
      const shared = Buffer.concat(payloads);
      let offset = 0;
      for (const payload of payloads) {
        rowData.addRow(shared, offset, payload.length);
        offset += payload.length;
      }
      const other = textPayload("row3");
      rowData.addRow(other, 0, other.length);
      expect(rowData.rowCount).toBe(4);
      expect(rowData.get(0, "x")).toBe("row0");
      expect(rowData.get(2, "x")).toBe("row2");
      expect(rowData.get(3, "x")).toBe("row3");
      // All retained -> trim only; the shared buffer is counted (pinned) once, not per row
      for (let i = 0; i < 4; i++) rowData.retain?.(i);
      rowData.finalize();
      expect(rowData.retainedBytes).toBe(shared.length + other.length + 4 * 4 * 3);
      expect(rowData.get(1, "x")).toBe("row1");
    });

    it("reassembles rows larger than a socket read into their own buffer", async () => {
      // A ~200 KiB cell spans several 64 KiB socket chunks, exercising the patched parser's
      // partial-message growth; the row adopts the reassembled buffer
      const big = "x".repeat(200 * 1024);
      const [classic, lazy] = await classicAndLazy("select repeat('x', 200 * 1024) as x, 'tail' as y");
      expect(classic[0].x).toBe(big);
      expect(lazy.get(0, "x")).toBe(big);
      expect(lazy.get(0, "y")).toBe("tail");
      lazy.retain?.(0);
      lazy.finalize();
      expect(lazy.get(0, "x")).toBe(big);
    });

    it("compacts unretained rows away and errors on their later access", () => {
      const rowData = new WireRowData();
      rowData.setRowDescription([{ name: "x", dataTypeID: pg.types.builtins.TEXT }], [(value: string) => value]);
      appendTextRow(rowData, "keep0");
      appendTextRow(rowData, "drop1");
      appendTextRow(rowData, "keep2");
      rowData.retain?.(0);
      rowData.retain?.(2);
      const before = rowData.payloadBytes;
      rowData.finalize();
      expect(rowData.payloadBytes).toBeLessThan(before);
      expect(rowData.get(0, "x")).toBe("keep0");
      expect(rowData.get(2, "x")).toBe("keep2");
      expect(() => rowData.get(1, "x")).toThrow("compacted away");
    });

    it("skips compaction when dropped rows are under the 20% byte threshold", () => {
      const rowData = new WireRowData();
      rowData.setRowDescription([{ name: "x", dataTypeID: pg.types.builtins.TEXT }], [(value: string) => value]);
      // 10 equal rows, 1 dropped = 10% of payload bytes: not worth re-copying the other 9
      for (let i = 0; i < 10; i++) appendTextRow(rowData, `row${i}`);
      for (let i = 0; i < 10; i++) {
        if (i !== 5) rowData.retain?.(i);
      }
      const before = rowData.payloadBytes;
      rowData.finalize();
      expect(rowData.payloadBytes).toBe(before);
      // The unretained row keeps its bytes and simply remains readable-but-unused
      expect(rowData.get(5, "x")).toBe("row5");
      expect(rowData.get(9, "x")).toBe("row9");
    });

    it("reads cells correctly in any order through the adaptive scan cursor", () => {
      // 20 columns forces the cursor to allocate (ordinal >= 8 faults); read ascending with
      // gaps, then descending (from-start fallback), then re-read (values are never cached)
      const names = Array.from({ length: 20 }, (_, i) => `c${i}`);
      const rowData = new WireRowData();
      rowData.setRowDescription(names.map((name) => ({ name, dataTypeID: pg.types.builtins.TEXT })));
      const cells = names.map((name, i) => (i === 10 ? null : Buffer.from(`v${i}`, "utf8")));
      const payload = dataRowPayload(cells);
      rowData.addRow(payload, 0, payload.length);
      rowData.addRow(payload, 0, payload.length);
      for (const i of [2, 9, 15, 19, 3, 12, 10, 0, 19]) {
        expect(rowData.get(0, `c${i}`)).toBe(i === 10 ? null : `v${i}`);
      }
      expect(rowData.get(1, "c19")).toBe("v19");
      // The cursor's row-relative offsets stay valid across compaction's payload rewrite
      rowData.retain?.(1);
      rowData.finalize?.();
      expect(rowData.get(1, "c19")).toBe("v19");
      expect(rowData.get(1, "c4")).toBe("v4");
    });

    it("validates row indexes and malformed payloads", () => {
      const rowData = new WireRowData();
      rowData.setRowDescription([{ name: "x", dataTypeID: pg.types.builtins.TEXT }], [(value: string) => value]);
      appendTextRow(rowData, "ok");
      expect(() => rowData.get(1, "x")).toThrow("Invalid rowIndex");
      expect(() => rowData.get(-1, "x")).toThrow("Invalid rowIndex");
      expect(rowData.get(0, "not_selected")).toBe(undefined);
      // A truncated payload: claims a 100-byte cell but only carries 2 bytes
      const bad = Buffer.alloc(2 + 4 + 2);
      bad.writeInt16BE(1, 0);
      bad.writeInt32BE(100, 2);
      const malformed = new WireRowData();
      malformed.setRowDescription([{ name: "x", dataTypeID: pg.types.builtins.TEXT }], [(value: string) => value]);
      malformed.addRow(bad, 0, bad.length);
      expect(() => malformed.get(0, "x")).toThrow("Malformed cell length");
    });
  });

  describe("error handling", () => {
    it("rejects the query promise on SQL errors and leaves the connection reusable", async () => {
      const client = await pool.connect();
      try {
        await expect(executeRowDataQuery(client, "select * from does_not_exist", [])).rejects.toThrow("does_not_exist");
        // Same client keeps working, classic and lazy
        expect((await client.query("select 1 as one")).rows).toEqual([{ one: 1 }]);
        const lazy = await executeRowDataQuery(client, "select 2 as two", []);
        expect(lazy.get(0, "two")).toBe(2);
      } finally {
        client.release();
      }
    });

    it("rejects loudly when the connection's pg-protocol emits classic DataRows", async () => {
      // Simulate a connection whose pg-protocol is unpatched (i.e. a duplicate pg install) by
      // driving the query lifecycle with a classic decoded DataRow message (no `bytes`)
      let query: any;
      const fakeClient = { query: (q: any) => (query = q) };
      const promise = executeRowDataQuery(fakeClient as any, "select 1 as one", []);
      query.handleRowDescription({ fields: [{ name: "one", dataTypeID: 23, format: "text" }] });
      query.handleDataRow({ fields: ["1"] });
      query.handleReadyForQuery();
      await expect(promise).rejects.toThrow("emits classic DataRows");
    });

    it("defers custom-parser errors to first access, not query await", async () => {
      const throwingPool = new pg.Pool({
        connectionString,
        types: {
          getTypeParser: (oid: number, format?: any) =>
            oid === pg.types.builtins.INT4
              ? () => {
                  throw new Error("boom parser");
                }
              : pg.types.getTypeParser(oid, format),
        } as any,
      });
      try {
        const client = await throwingPool.connect();
        try {
          // Classic mode throws while awaiting the query; lazy mode resolves and throws on access
          await expect(client.query("select 7::int4 as x")).rejects.toThrow("boom parser");
          const lazy = await executeRowDataQuery(client, "select 7::int4 as x", []);
          expect(() => lazy.get(0, "x")).toThrow("boom parser");
        } finally {
          client.release();
        }
      } finally {
        await throwingPool.end();
      }
    });
  });

  it("toRow/toRows rematerialize consistently (values are not cached)", async () => {
    const [classic, lazy] = await classicAndLazy("select 1 as a, 'x' as b, null::text as c");
    expect(lazy.toRow(0)).toEqual(classic[0]);
    expect(lazy.toRow(0)).toEqual(lazy.toRow(0));
    expect(lazy.toRows()).toEqual(classic);
  });

  describe("adopted (zero-copy) rows", () => {
    it("retains message bytes by reference and compacts them into owned memory", async () => {
      // The patched parser guarantees message bytes are immutable, so WireRowData retains rows
      // as views instead of copying; drive the query lifecycle with parser-shaped messages
      let query: any;
      const fakeClient = { query: (q: any) => (query = q) };
      const promise = executeRowDataQuery(fakeClient as any, "select fake", [], { binary: false });
      query.handleRowDescription({ fields: [{ name: "x", dataTypeID: 25, format: "text" }] });
      // Two one-cell rows sharing one buffer, like two DataRows inside one socket chunk;
      // `length` is the frame's int32 value (payload + the int32 itself)
      const frame1 = nativeDataRowFrame("hello");
      const chunk = Buffer.concat([frame1, nativeDataRowFrame("world")]);
      query.handleDataRow({ name: "dataRow", bytes: chunk, offset: 5, length: frame1.length - 1 });
      query.handleDataRow({ name: "dataRow", bytes: chunk, offset: frame1.length + 5, length: frame1.length - 1 });
      query.handleReadyForQuery();
      const rowData = (await promise) as WireRowData;
      expect(rowData.rowCount).toBe(2);
      expect(rowData.get(0, "x")).toBe("hello");
      expect(rowData.get(1, "x")).toBe("world");
      // Zero-copy: rows are views over `chunk` (values are not cached), so mutations show through
      chunk[11] = "H".charCodeAt(0);
      expect(rowData.get(0, "x")).toBe("Hello");
      // Retaining only row 1 drops >20% of the payload bytes, so finalize compacts it into
      // owned memory: later source mutations no longer show, and dropped rows error
      rowData.retain?.(1);
      rowData.finalize?.();
      chunk[frame1.length + 11] = "W".charCodeAt(0);
      expect(rowData.get(1, "x")).toBe("world");
      expect(() => rowData.get(0, "x")).toThrow("compacted away");
    });
  });

  describe("entity loader lifecycle", () => {
    // These go through the real em.load/em.find loaders, so they only apply in lazy mode
    const itLazy = process.env.JOIST_ROW_DATA === "1" ? it : it.skip;

    itLazy("compacts unretained duplicate rows after em.find", async () => {
      for (let i = 1; i <= 20; i++) await insertAuthor({ first_name: `a${i}` });
      const em = newEntityManager();
      // Pre-load half the authors, so the later find sees their rows as already-loaded duplicates
      const preloaded = await em.loadAll(
        Author,
        Array.from({ length: 10 }, (_, i) => `a:${i + 1}`),
      );
      expect(getInstanceData(preloaded[0]).rowData).toBeInstanceOf(WireRowData);
      const authors = await em.find(Author, {});
      expect(authors).toHaveLength(20);
      // The 10 fresh entities share the find's result; the pre-loaded 10 keep their em.load result
      const fresh = authors.filter((a) => Number(a.id.split(":")[1]) > 10);
      const wire = getInstanceData(fresh[0]).rowData as WireRowData;
      expect(wire).toBeInstanceOf(WireRowData);
      expect(wire).not.toBe(getInstanceData(preloaded[0]).rowData);
      expect(wire.rowCount).toBe(20);
      // With 10 of 20 rows unretained (>20% of payload bytes), finalize compacted the duplicates
      // away: dropped rows now error, while retained rows still lazily fault fields
      const freshIndexes = new Set(fresh.map((a) => getInstanceData(a).rowIndex));
      const dropped = Array.from({ length: 20 }, (_, i) => i).filter((i) => !freshIndexes.has(i));
      expect(dropped).toHaveLength(10);
      expect(() => wire.get(dropped[0], "first_name")).toThrow("compacted away");
      expect(fresh.map((a) => a.firstName).sort()).toEqual(
        Array.from({ length: 10 }, (_, i) => `a${i + 11}`).sort(),
      );
      expect(preloaded.map((a) => a.firstName).sort()).toEqual(
        Array.from({ length: 10 }, (_, i) => `a${i + 1}`).sort(),
      );
    });
  });
});

/** Builds a complete one-cell DataRow frame (code + int32 length + payload), i.e. a native message's `bytes`. */
function nativeDataRowFrame(cell: string): Buffer {
  const payload = dataRowPayload([Buffer.from(cell, "utf8")]);
  const header = Buffer.alloc(5);
  header[0] = "D".charCodeAt(0);
  header.writeInt32BE(payload.length + 4, 1);
  return Buffer.concat([header, payload]);
}

/** Adopts a one-text-cell DataRow payload into `rowData` (each call brings its own buffer/chunk). */
function appendTextRow(rowData: WireRowData, text: string): void {
  const cell = Buffer.from(text, "utf8");
  rowData.addRow(dataRowPayload([cell]), 0, 2 + 4 + cell.length);
}

/** Builds a one-text-cell DataRow payload buffer. */
function textPayload(text: string): Buffer {
  return dataRowPayload([Buffer.from(text, "utf8")]);
}

/** Builds a DataRow payload (int16 fieldCount + length-prefixed cells; null = SQL NULL). */
function dataRowPayload(cells: Array<Buffer | null>): Buffer<ArrayBuffer> {
  const parts: Buffer[] = [Buffer.alloc(2)];
  parts[0].writeInt16BE(cells.length, 0);
  for (const cell of cells) {
    const len = Buffer.alloc(4);
    len.writeInt32BE(cell === null ? -1 : cell.length, 0);
    parts.push(len);
    if (cell !== null) parts.push(cell);
  }
  return Buffer.concat(parts) as Buffer<ArrayBuffer>;
}
