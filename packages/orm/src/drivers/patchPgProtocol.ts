import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const runtimeRequire = createRequire(__filename);

/**
 * Patches pg-protocol at runtime so that DataRow messages are lazy *and* their bytes are
 * immutable, i.e. so `WireRowData` can retain raw row payloads by reference — no per-cell
 * strings, no per-row copies, no arena.
 *
 * We patch at runtime (instead of shipping a patched pg-protocol) so that installing joist-orm
 * requires no package-manager patch steps; see JS-ROW-STORE-DESIGN.md "Distribution". Two
 * prototype methods are replaced, porting brianc/node-postgres#3719 (which may or may not ever
 * land upstream — this patch is how we run its design in production regardless):
 *
 * - `handlePacket` (stable across pg-protocol 1.10-1.15) returns a {@link LazyDataRowMessage}
 *   for DataRow packets and delegates every other message type to the original.
 * - `parse` replaces the recycled-scratch buffer management: each socket chunk is parsed *in
 *   place*, and only the one message per chunk that straddles a read boundary is reassembled
 *   into a buffer of its own, which is handed to that message and never touched again. Every
 *   message therefore stays valid for as long as it is held (holding one pins the ~64 KiB chunk
 *   it came from) — versus stock pg-protocol, which copies whole chunks into a scratch buffer
 *   and compacts it in place over the bytes earlier messages point into.
 *
 * The patch verifies itself by round-tripping synthetic DataRows through a fresh `Parser` —
 * including a message that straddles chunks, retained across later reads that would clobber it
 * under the stock buffer management. On any mismatch (i.e. a future pg-protocol internals
 * rewrite), it un-patches and reports failure so the driver can fall back to classic rows.
 *
 * The lazy message's memoized `fields` getter decodes identically to the original for classic
 * consumers, i.e. pg's own `Result.parseRow(msg.fields)`.
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
    /** The row's payload bytes; immutable under our `parse` patch, so safe to retain. */
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
const CODE_LENGTH = 1;
const HEADER_LENGTH = 5;
/** Cap on up-front allocation for a straddling message's claimed length, i.e. corrupt streams. */
const MAX_EAGER_MESSAGE_LENGTH = 1024 * 1024;
const emptyBuffer = Buffer.allocUnsafe(0);

/** Resolves pg's own pg-protocol Parser class and swaps in the lazy/immutable DataRow handling. */
function tryPatch(): boolean {
  try {
    const { Parser, version } = resolvePgProtocol();
    // Only patch the protocol major we've verified `handlePacket`'s shape against (1.10-1.15);
    // anything else fails closed (the driver then uses classic rows) until explicitly vetted
    if (!/^1\./.test(version)) return false;
    const originalHandlePacket = Parser.prototype.handlePacket;
    const originalParse = Parser.prototype.parse;
    if (typeof originalHandlePacket !== "function" || typeof originalParse !== "function") return false;
    Parser.prototype.handlePacket = function (offset: number, code: number, length: number, bytes: Buffer) {
      if (code === DATA_ROW_CODE) return new LazyDataRowMessage(length, bytes, offset);
      return originalHandlePacket.call(this, offset, code, length, bytes);
    };
    Parser.prototype.parse = patchedParse;
    if (!verifyLazyDataRows(Parser) || !verifyImmutableBytes(Parser)) {
      Parser.prototype.handlePacket = originalHandlePacket;
      Parser.prototype.parse = originalParse;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The ported #3719 `parse`: chunks are parsed in place, and only the message that straddles a
 * read boundary is reassembled into its own buffer (see `completePartial`). Partial state lives
 * on the parser instance under `_joist`-prefixed keys, so the stock fields are simply unused.
 */
function patchedParse(this: any, chunk: Buffer, callback: (msg: any) => void): void {
  const chunkLength = chunk.byteLength;
  // finish the message the previous chunk cut in half, if any, before parsing this one
  let offset = this._joistPartialLength > 0 ? completePartial(this, chunk, callback) : 0;
  while (offset + HEADER_LENGTH <= chunkLength) {
    const code = chunk[offset];
    const length = chunk.readUInt32BE(offset + CODE_LENGTH);
    const fullMessageLength = CODE_LENGTH + length;
    if (fullMessageLength + offset <= chunkLength) {
      const message = this.handlePacket(offset + HEADER_LENGTH, code, length, chunk);
      callback(message);
      offset += fullMessageLength;
    } else {
      break;
    }
  }
  if (offset < chunkLength) {
    startPartial(this, chunk, offset);
  }
}

/** Copies the trailing bytes of `chunk` that do not yet form a whole message into their own buffer. */
function startPartial(parser: any, chunk: Buffer, offset: number): void {
  const remaining = chunk.byteLength - offset;
  parser._joistPartial = emptyBuffer;
  parser._joistPartialLength = 0;
  // the length is only known once the header is complete
  parser._joistPartialTotal = remaining >= HEADER_LENGTH ? CODE_LENGTH + chunk.readUInt32BE(offset + CODE_LENGTH) : -1;
  growPartial(parser, remaining);
  chunk.copy(parser._joistPartial, 0, offset);
  parser._joistPartialLength = remaining;
}

/**
 * Fills the straddling message from the head of `chunk` and emits it once whole, returning the
 * offset in `chunk` where parsing continues. The buffer is handed to the message and forgotten,
 * so nothing is ever parsed twice out of the same bytes and the message stays valid when held.
 */
function completePartial(parser: any, chunk: Buffer, callback: (msg: any) => void): number {
  let consumed = 0;
  if (parser._joistPartialTotal === -1) {
    // the header itself was split, so complete it before its length can be read
    consumed = Math.min(HEADER_LENGTH - parser._joistPartialLength, chunk.byteLength);
    chunk.copy(parser._joistPartial, parser._joistPartialLength, 0, consumed);
    parser._joistPartialLength += consumed;
    if (parser._joistPartialLength < HEADER_LENGTH) return consumed;
    parser._joistPartialTotal = CODE_LENGTH + parser._joistPartial.readUInt32BE(CODE_LENGTH);
  }
  if (parser._joistPartialLength < parser._joistPartialTotal) {
    const available = Math.min(parser._joistPartialTotal - parser._joistPartialLength, chunk.byteLength - consumed);
    growPartial(parser, parser._joistPartialLength + available);
    chunk.copy(parser._joistPartial, parser._joistPartialLength, consumed, consumed + available);
    parser._joistPartialLength += available;
    consumed += available;
    if (parser._joistPartialLength < parser._joistPartialTotal) return consumed;
  }
  const partial = parser._joistPartial;
  parser._joistPartial = emptyBuffer;
  parser._joistPartialLength = 0;
  parser._joistPartialTotal = -1;
  const message = parser.handlePacket(HEADER_LENGTH, partial[0], partial.readUInt32BE(CODE_LENGTH), partial);
  callback(message);
  return consumed;
}

/** Sizes the partial buffer to hold at least `needed` bytes, i.e. the whole message when known. */
function growPartial(parser: any, needed: number): void {
  if (needed <= parser._joistPartial.byteLength) return;
  const total = parser._joistPartialTotal;
  // grow geometrically, jumping straight to the message's full length when known and modest
  const whole = total === -1 ? HEADER_LENGTH : Math.min(total, MAX_EAGER_MESSAGE_LENGTH);
  let capacity = Math.max(needed, whole, parser._joistPartial.byteLength * 2);
  if (total !== -1 && capacity > total) capacity = total;
  const grown = Buffer.allocUnsafe(capacity);
  parser._joistPartial.copy(grown, 0, 0, parser._joistPartialLength);
  parser._joistPartial = grown;
}

/** Loads the Parser class + version from the pg-protocol instance that `pg` itself resolves to. */
function resolvePgProtocol(): { Parser: any; version: string } {
  // Resolve pg-protocol relative to pg, so that we patch the copy pg's Connections actually
  // use, even if the dependency tree has multiple pg-protocol installs
  const pgPath = runtimeRequire.resolve("pg");
  const parserPath = runtimeRequire.resolve("pg-protocol/dist/parser.js", { paths: [dirname(pgPath)] });
  // An absolute-path require bypasses the package's exports map, so this is always readable
  const { version } = runtimeRequire(join(dirname(parserPath), "..", "package.json"));
  return { Parser: runtimeRequire(parserPath).Parser, version };
}

/** Round-trips a synthetic two-cell DataRow (utf8 + NULL) through a fresh patched Parser. */
function verifyLazyDataRows(Parser: any): boolean {
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
      typeof msg.offset === "number" &&
      msg.fields.length === 2 &&
      msg.fields[0] === "wörld" &&
      msg.fields[1] === null;
  });
  return ok;
}

/**
 * Verifies a straddling DataRow's bytes survive later parser reads.
 *
 * We retain a message that straddles two chunks, drive a third read shaped to trigger the stock
 * parser's move-to-front compaction over its bytes, and only then decode the retained message's
 * cell (the `fields` getter memoizes, so it must not be read earlier). Under our `parse` patch
 * the straddler owns its buffer, so the cell decodes intact.
 */
function verifyImmutableBytes(Parser: any): boolean {
  const cellB = "b".repeat(85);
  const frameA = dataRowFrame("aaaa"); // 15 bytes, fully inside chunk1
  const frameB = dataRowFrame(cellB); // 96 bytes, straddles chunk1/chunk2
  const frameC = dataRowFrame("c".repeat(45)); // 56 bytes, straddles chunk2/chunk3
  const chunk1 = Buffer.concat([frameA, frameB.subarray(0, 50)]);
  const chunk2 = Buffer.concat([frameB.subarray(50), frameC.subarray(0, 30)]);
  const chunk3 = Buffer.from(frameC.subarray(30));
  const messages: any[] = [];
  const parser = new Parser();
  function collect(msg: any): void {
    messages.push(msg);
  }
  parser.parse(chunk1, collect);
  parser.parse(chunk2, collect);
  parser.parse(chunk3, collect);
  try {
    return messages.length === 3 && messages[1].name === "dataRow" && messages[1].fields[0] === cellB;
  } catch {
    return false;
  }
}

/** Builds a complete one-cell DataRow frame (code + int32 length + payload) for `cell`. */
function dataRowFrame(cell: string): Buffer {
  const bytes = Buffer.from(cell, "utf8");
  const payload = Buffer.concat([Buffer.from([0, 1]), int32(bytes.length), bytes]);
  return Buffer.concat([Buffer.from("D"), int32(payload.length + 4), payload]);
}

/** Returns a 4-byte big-endian buffer for `value`. */
function int32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}
