import { dirname } from "node:path";

/**
 * Patches pg-protocol's `Parser.prototype.handlePacket` at runtime to defer per-cell string
 * materialization of `DataRow` messages, i.e. so `WireRowData` can copy raw DataRow payload
 * bytes without any per-cell strings, per-row arrays, or per-row message objects ever being
 * created.
 *
 * We patch at runtime (instead of shipping a patched pg-protocol) so that installing joist-orm
 * requires no package-manager patch steps; see JS-ROW-STORE-DESIGN.md "Distribution". The patch:
 *
 * - resolves the same pg-protocol module instance that `pg` itself uses (so the prototype we
 *   patch is the one every `Connection`'s parser dispatches through),
 * - wraps `handlePacket` (stable across pg-protocol 1.10-1.15, unlike the per-message parse
 *   functions, which became module-level closures in 1.15) to return a
 *   {@link LazyDataRowMessage} for DataRow packets and delegate every other message type to the
 *   original, and
 * - verifies itself by round-tripping a synthetic DataRow through a fresh `Parser`; on any
 *   mismatch (i.e. a future pg-protocol internals rewrite), it un-patches and reports failure so
 *   the driver can fall back to classic rows.
 *
 * The lazy message's memoized `fields` getter decodes identically to the original for classic
 * consumers; pg's own `Result.parseRow(msg.fields)` reads it in the same tick as parsing, before
 * the parser's buffer can be reused by a later chunk.
 */
export function ensureLazyDataRows(): boolean {
  patched ??= tryPatch() ? "applied" : "failed";
  return patched === "applied";
}

/** A drop-in `DataRowMessage` that defers cell decoding; lazy consumers read `bytes`/`offset`. */
export class LazyDataRowMessage {
  public readonly name = "dataRow";
  public readonly fieldCount: number;
  #fields: (string | null)[] | undefined = undefined;

  constructor(
    public readonly length: number,
    /** The parser's buffer + payload offset; only valid within the same tick as parsing. */
    public readonly bytes: Buffer,
    public readonly offset: number,
  ) {
    this.fieldCount = bytes.readInt16BE(offset);
  }

  /** Lazily materializes the per-cell strings for classic consumers, i.e. pg's `Result.parseRow`. */
  get fields(): (string | null)[] {
    let fields = this.#fields;
    if (fields === undefined) {
      const { bytes, fieldCount } = this;
      fields = new Array(fieldCount);
      let pos = this.offset + 2;
      for (let i = 0; i < fieldCount; i++) {
        const len = bytes.readInt32BE(pos);
        pos += 4;
        if (len === -1) {
          fields[i] = null;
        } else {
          fields[i] = bytes.toString("utf8", pos, pos + len);
          pos += len;
        }
      }
      this.#fields = fields;
    }
    return fields;
  }
}

let patched: "applied" | "failed" | undefined;

/** The 'D' message-type byte identifying a DataRow packet. */
const DATA_ROW_CODE = 68;

/** Resolves pg's own pg-protocol Parser class and swaps in the lazy DataRow handling. */
function tryPatch(): boolean {
  try {
    const Parser = resolvePgParser();
    const original = Parser.prototype.handlePacket;
    if (typeof original !== "function") return false;
    Parser.prototype.handlePacket = function (offset: number, code: number, length: number, bytes: Buffer) {
      if (code === DATA_ROW_CODE) return new LazyDataRowMessage(length, bytes, offset);
      return original.call(this, offset, code, length, bytes);
    };
    if (!verifyPatch(Parser)) {
      Parser.prototype.handlePacket = original;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Loads the Parser class from the pg-protocol instance that `pg` itself resolves to. */
function resolvePgParser(): any {
  // Resolve pg-protocol relative to pg, so that we patch the copy pg's Connections actually
  // use, even if the dependency tree has multiple pg-protocol installs
  const pgPath = require.resolve("pg");
  const parserPath = require.resolve("pg-protocol/dist/parser.js", { paths: [dirname(pgPath)] });
  return require(parserPath).Parser;
}

/** Round-trips a synthetic two-cell DataRow (utf8 + NULL) through a fresh patched Parser. */
function verifyPatch(Parser: any): boolean {
  const cell = Buffer.from("wörld", "utf8");
  const payload = Buffer.concat([
    Buffer.from([0, 2]), // int16 fieldCount
    int32(cell.length),
    cell,
    int32(-1), // NULL cell
  ]);
  const frame = Buffer.concat([Buffer.from("D"), int32(payload.length + 4), payload]);
  let ok = false;
  new Parser().parse(frame, (msg: any) => {
    ok =
      msg.name === "dataRow" &&
      msg.fieldCount === 2 &&
      msg.bytes !== undefined &&
      msg.fields.length === 2 &&
      msg.fields[0] === "wörld" &&
      msg.fields[1] === null;
  });
  return ok;
}

/** Returns a 4-byte big-endian buffer for `value`. */
function int32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}
