import {
  type Driver,
  type DriverQueryResult,
  type EntityManager,
  type ParsedFindQuery,
  buildRawQuery,
} from "joist-orm";
import { type AnyParseFunction, type DataMappingOptions, type FieldInfo, Pool, RowDecoder } from "postgrejs";

import { WireRowData } from "../../orm/src/drivers/WireRowData.ts";

/** Read-path prototype: real Joist hydration over PostgreJS, with optional eager binary control. */
export class PostgreJsPrototype implements Driver {
  readonly defaultPlugins = {};
  readonly executeFindRowData: Driver["executeFindRowData"];

  constructor(
    readonly pool: Pool,
    lazy = true,
  ) {
    this.executeFindRowData = lazy
      ? async (em, parsed, settings) => {
          const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
          const decoder = new JoistRowDecoder();
          await pool.query(toPgParams(sql), { params: [...bindings], rowDecoder: decoder, fetchCount: 0 });
          return decoder.rows;
        }
      : undefined;
  }

  /** Uses eager rows for the loaders that do not request RowData. */
  async executeFind(em: EntityManager, parsed: ParsedFindQuery, settings: { limit?: number; offset?: number }) {
    const { sql, bindings } = buildRawQuery(parsed, { limit: em.entityLimit, ...settings });
    return (await this.executeQuery(em, sql, bindings)).rows;
  }

  /** Preserves Joist's row/count result shape for ordinary queries. */
  async executeQuery(_em: EntityManager, sql: string, bindings: readonly unknown[]): Promise<DriverQueryResult> {
    const result = await this.pool.query(toPgParams(sql), {
      params: [...bindings],
      rowDecoder: "object",
      fetchCount: 0,
    });
    return { rows: result.rows ?? [], rowCount: result.rowsAffected ?? null };
  }

  /** Writes are outside this read-path experiment. */
  async assignNewIds(): Promise<never> {
    throw new Error("PostgreJS prototype is read-only");
  }

  /** Writes are outside this read-path experiment. */
  async flush(): Promise<never> {
    throw new Error("PostgreJS prototype is read-only");
  }

  /** Do not silently execute transactional work outside a transaction. */
  async transaction<T>(_em: EntityManager, _fn: (txn: unknown) => Promise<T>): Promise<T> {
    throw new Error("PostgreJS prototype does not implement transactions");
  }
}

/** Bridges PostgreJS's documented immutable bytes/parsers to Joist's existing retain/compact lifecycle. */
export class JoistRowDecoder extends RowDecoder {
  readonly rows = new WireRowData(0);
  #chunk: Buffer | undefined;

  /** Supports paths that provide a row subarray instead of its socket buffer and offset. */
  decode(parsers: AnyParseFunction[], data: Buffer, count: number, options: DataMappingOptions, fields: FieldInfo[]) {
    if (this.#chunk?.buffer !== data.buffer) this.#chunk = Buffer.from(data.buffer);
    return this.decodeAt(parsers, this.#chunk!, data.byteOffset, data.byteLength, count, options, fields);
  }

  /** Records immutable socket bytes without allocating a Buffer view for each row. */
  override decodeAt(
    parsers: AnyParseFunction[],
    buffer: Buffer,
    offset: number,
    length: number,
    _count: number,
    options: DataMappingOptions,
    fields: FieldInfo[],
  ) {
    if (this.rows.rowCount === 0) {
      this.rows.setColumnDecoders(
        fields.map((field, i) => ({
          name: field.fieldName,
          decode: (chunk, offset, length) => parsers[i](chunk, offset, length, options),
        })),
      );
    }
    this.rows.addRow(buffer, offset, length);
    // PostgreJS still appends this sentinel to its result.rows; it dies with the query result.
    return undefined;
  }
}

/** Mirrors PostgresDriver's placeholder conversion, including the JSON @? operator. */
function toPgParams(sql: string): string {
  let index = 0;
  return sql.replace(/(?<!@)\?/g, () => `$${++index}`);
}
