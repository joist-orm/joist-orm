import { ensureLazyDataRows, executeRowDataQuery, WireRowData } from "joist-orm/pg";
import pg from "pg";

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

    it("decodes binary-format cells byte-exactly", () => {
      // Unit-level: a binary int4 cell (00 00 00 07) must reach the binary parser as bytes;
      // note classic pg round-trips through utf8 (lossy >= 0x80), so we assert on the raw bytes
      const rowData = new WireRowData();
      rowData.setRowDescription(
        [{ name: "x", dataTypeID: pg.types.builtins.INT4, format: "binary" }],
        [(value: Buffer) => value.readInt32BE(0)],
      );
      rowData.appendRow(dataRowPayload([Buffer.from([0, 0, 0, 7])]), 0, 4 + 4 + 2);
      expect(rowData.get(0, "x")).toBe(7);
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

    it("retains roughly one row of bytes for a one-row result after finalize", async () => {
      const [, lazy] = await classicAndLazy("select 'hello' as x");
      lazy.retain?.(0);
      lazy.finalize();
      expect(lazy.payloadBytes).toBeLessThan(64);
      // The review gate: not the old fixed 256 KiB arena — just the row + tiny index tables
      expect(lazy.retainedBytes).toBeLessThan(128);
      expect(lazy.get(0, "x")).toBe("hello");
    });

    it("crosses chunk boundaries and gives oversized rows dedicated chunks", () => {
      const rowData = new WireRowData();
      rowData.setRowDescription([{ name: "x", dataTypeID: pg.types.builtins.TEXT }], [(value: string) => value]);
      // ~1 KiB rows to cross the 64 KiB chunk boundary, plus one 100 KiB oversized row
      const small = "a".repeat(1024);
      const big = "b".repeat(100 * 1024);
      for (let i = 0; i < 100; i++) appendTextRow(rowData, small);
      appendTextRow(rowData, big);
      for (let i = 0; i < 10; i++) appendTextRow(rowData, small);
      expect(rowData.rowCount).toBe(111);
      expect(rowData.get(0, "x")).toBe(small);
      expect(rowData.get(63, "x")).toBe(small); // around the 64 KiB boundary
      expect(rowData.get(100, "x")).toBe(big); // the dedicated chunk
      expect(rowData.get(110, "x")).toBe(small); // resumed the partial chunk
      // Trim keeps every row readable and drops slack
      for (let i = 0; i < 111; i++) rowData.retain?.(i);
      rowData.finalize();
      expect(rowData.get(110, "x")).toBe(small);
      expect(rowData.retainedBytes).toBeLessThan(rowData.payloadBytes + 64 * 1024 + 111 * 12);
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
      malformed.appendRow(bad, 0, bad.length);
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
});

/** Appends a one-text-cell DataRow payload to `rowData`. */
function appendTextRow(rowData: WireRowData, text: string): void {
  const cell = Buffer.from(text, "utf8");
  rowData.appendRow(dataRowPayload([cell]), 0, 2 + 4 + cell.length);
}

/** Builds a DataRow payload (int16 fieldCount + length-prefixed cells) from cell buffers. */
function dataRowPayload(cells: Buffer[]): Buffer<ArrayBuffer> {
  const parts: Buffer[] = [Buffer.alloc(2)];
  parts[0].writeInt16BE(cells.length, 0);
  for (const cell of cells) {
    const len = Buffer.alloc(4);
    len.writeInt32BE(cell.length, 0);
    parts.push(len, cell);
  }
  return Buffer.concat(parts) as Buffer<ArrayBuffer>;
}
