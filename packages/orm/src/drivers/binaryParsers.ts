import pg from "pg";

/**
 * Decoders for Postgres *binary-format* result cells, used by `WireRowData` when a lazy query
 * requests binary results (see `executeRowDataQuery`'s `binary` option).
 *
 * Every decoder preserves parity with what the classic text-format path would have produced,
 * via a two-tier strategy:
 *
 * 1. A direct fast path (wire bytes -> value, zero intermediate strings) is used only when the
 *    column's active text parser is *identical* to the default parser snapshotted at module
 *    load — i.e. nobody customized this oid, so we know the text semantics we're replacing.
 * 2. Otherwise the cell is rendered to Postgres's canonical *text* representation and passed
 *    through the active text parser, so pool/client `TypeOverrides`, joist's global temporal
 *    parsers, and app-registered custom parsers all keep working unchanged.
 *
 * Unknown oids fall back to utf8 text (correct for enums, citext, and domains over text);
 * known non-text binary layouts we can't render (i.e. tsvector) throw on first access — which,
 * being lazy, only happens if the application actually reads that column.
 */
export function wireBinaryParser(oid: number, textParse: (value: any) => any): BinaryParse {
  const paired = pairedFastPaths.get(oid)?.get(textParse);
  if (paired !== undefined) return paired;
  if (textParse === defaultTextParsers.get(oid)) {
    const fast = fastParsers[oid];
    if (fast !== undefined) return fast;
    const factory = fastFactories[oid];
    if (factory !== undefined) return factory(textParse);
  }
  const render = textRenderers[oid] ?? renderUtf8;
  return (chunk, start, length) => textParse(render(chunk, start, length));
}

/**
 * Pairs an *installed* text parser with a direct binary decoder for `oid`.
 *
 * The fast paths above only apply to untouched default parsers; when joist (or an app)
 * installs a known text parser globally — i.e. `setupLatestPgTypes`'s timestamptz parser —
 * this registers a decoder with matching semantics, keyed by the parser's identity, so binary
 * cells skip the render-to-text-then-parse round trip.
 */
export function registerBinaryFastPath(oid: number, textParse: (value: any) => any, fast: BinaryParse): void {
  let byParser = pairedFastPaths.get(oid);
  if (byParser === undefined) pairedFastPaths.set(oid, (byParser = new Map()));
  byParser.set(textParse, fast);
}

/**
 * Builds a µs -> `Date` decoder for timestamptz columns, paired with postgres-date-style text
 * parsers (i.e. what `setupLatestPgTypes` installs in Date mode).
 *
 * Matches the text parser's semantics exactly: sub-ms digits floor to the millisecond (text
 * fraction digits truncate, which is a floor in absolute time), and the infinity sentinels
 * delegate to the text parser (postgres-date returns the JS number `Infinity`, not a Date).
 */
export function binaryTimestamptzToDate(textParse: (value: any) => any): BinaryParse {
  return (chunk, start) => {
    const pgMicros = chunk.readBigInt64BE(start);
    if (pgMicros === INFINITY_US) return textParse("infinity");
    if (pgMicros === NEG_INFINITY_US) return textParse("-infinity");
    const epochMicros = pgMicros + PG_EPOCH_US;
    let ms = epochMicros / 1000n;
    if (epochMicros % 1000n < 0n) ms -= 1n;
    return new Date(Number(ms));
  };
}

/** Decodes one binary cell directly from the payload chunk; `length` is the cell's byte length. */
type BinaryParse = (chunk: Buffer, start: number, length: number) => any;

/** Renders one binary cell to Postgres's canonical text representation. */
type TextRender = (chunk: Buffer, start: number, length: number) => string;

// Microseconds between the Postgres epoch (2000-01-01) and the Unix epoch (1970-01-01)
const PG_EPOCH_US = 946_684_800_000_000n;
const PG_EPOCH_DAYS = 10_957;
const US_PER_DAY = 86_400_000_000n;
// The wire sentinels for `infinity` / `-infinity` timestamps and dates
const INFINITY_US = 0x7fffffffffffffffn;
const NEG_INFINITY_US = -0x8000000000000000n;
const INFINITY_DAYS = 0x7fffffff;
const NEG_INFINITY_DAYS = -0x80000000;

const oids = pg.types.builtins;

/** Direct decoders paired with specific installed text parsers, keyed by oid then parser identity. */
const pairedFastPaths = new Map<number, Map<(value: any) => any, BinaryParse>>();

/** Direct wire-bytes -> value decoders, valid only against the default text-parser semantics. */
const fastParsers: Record<number, BinaryParse> = {
  [oids.BOOL]: (chunk, start) => chunk[start] !== 0,
  [oids.INT2]: (chunk, start) => chunk.readInt16BE(start),
  [oids.INT4]: (chunk, start) => chunk.readInt32BE(start),
  [oids.OID]: (chunk, start) => chunk.readUInt32BE(start),
  [oids.FLOAT4]: (chunk, start) => readFloat4(chunk, start),
  [oids.FLOAT8]: (chunk, start) => chunk.readDoubleBE(start),
  // pg's default text parser leaves int8 as a string, so match that shape
  [oids.INT8]: (chunk, start) => chunk.readBigInt64BE(start).toString(),
  [oids.TEXT]: renderUtf8,
  [oids.VARCHAR]: renderUtf8,
  [oids.BPCHAR]: renderUtf8,
  [19 /* name */]: renderUtf8,
  [oids.UUID]: (chunk, start) => renderUuid(chunk, start),
  // Exact byte copy — note this also fixes classic pg's lossy utf8 round-trip for binary cells
  [oids.BYTEA]: (chunk, start, length) => copyBytes(chunk, start, length),
  [oids.JSON]: (chunk, start, length) => JSON.parse(chunk.toString("utf8", start, start + length)),
  // jsonb payloads have a 1-byte version prefix before the JSON text
  [oids.JSONB]: (chunk, start, length) => JSON.parse(chunk.toString("utf8", start + 1, start + length)),
};

/** Binary -> canonical pg text renderers, for the custom-parser and always-text-shaped types. */
const textRenderers: Record<number, TextRender> = {
  [oids.BOOL]: (chunk, start) => (chunk[start] !== 0 ? "t" : "f"),
  [oids.INT2]: (chunk, start) => String(chunk.readInt16BE(start)),
  [oids.INT4]: (chunk, start) => String(chunk.readInt32BE(start)),
  [oids.OID]: (chunk, start) => String(chunk.readUInt32BE(start)),
  [oids.INT8]: (chunk, start) => chunk.readBigInt64BE(start).toString(),
  [oids.FLOAT4]: (chunk, start) => String(readFloat4(chunk, start)),
  [oids.FLOAT8]: (chunk, start) => String(chunk.readDoubleBE(start)),
  [oids.UUID]: (chunk, start) => renderUuid(chunk, start),
  [oids.BYTEA]: (chunk, start, length) => `\\x${chunk.toString("hex", start, start + length)}`,
  [oids.JSONB]: (chunk, start, length) => chunk.toString("utf8", start + 1, start + length),
  [oids.NUMERIC]: renderNumeric,
  [oids.DATE]: dateCellAsPgText,
  [oids.TIMESTAMP]: timestampCellAsPgText,
  [oids.TIMESTAMPTZ]: timestamptzCellAsPgText,
  [3910 /* tstzrange */]: (chunk, start) =>
    renderRange(chunk, start, (c, s) => `"${renderTimestamp(c.readBigInt64BE(s), "+00")}"`),
  [3614 /* tsvector */]: renderTsVector,
};

// Array oids -> element oids; arrays always render a `{...}` literal for the active text parser,
// which guarantees parity with text mode for default, custom, and unregistered array parsers alike
const arrayOids: Record<number, number> = {
  1000: oids.BOOL,
  1005: oids.INT2,
  1007: oids.INT4,
  1016: oids.INT8,
  1021: oids.FLOAT4,
  1022: oids.FLOAT8,
  1009: oids.TEXT,
  1015: oids.VARCHAR,
  1014: oids.BPCHAR,
  1231: oids.NUMERIC,
  1182: oids.DATE,
  1115: oids.TIMESTAMP,
  1185: oids.TIMESTAMPTZ,
  2951: oids.UUID,
  199: oids.JSON,
  3807: oids.JSONB,
  1001: oids.BYTEA,
};

for (const arrayOid of Object.keys(arrayOids)) {
  textRenderers[Number(arrayOid)] = renderArrayLiteral;
}

/** Default-parser fast paths that need the text parser in scope, i.e. for sentinel fallbacks. */
const fastFactories: Record<number, (textParse: (value: any) => any) => BinaryParse> = {
  [oids.DATE]: binaryDateToLocalDate,
};

/** The untouched default text parsers, snapshotted before any later app customization. */
const defaultTextParsers = new Map<number, (value: any) => any>(
  [...Object.keys(fastParsers), ...Object.keys(fastFactories)].map((oid) => [
    Number(oid),
    pg.types.getTypeParser(Number(oid), "text"),
  ]),
);

/** Renders a binary date cell to pg's text form, i.e. `2020-01-02`; usable as a temporal-mode pairing. */
export function dateCellAsPgText(chunk: Buffer, start: number): string {
  return renderDate(chunk.readInt32BE(start) + PG_EPOCH_DAYS);
}

/** Renders a binary timestamp cell to pg's text form, i.e. `2020-01-02 03:04:05.678`. */
export function timestampCellAsPgText(chunk: Buffer, start: number): string {
  return renderTimestamp(chunk.readBigInt64BE(start), "");
}

/** Renders a binary timestamptz cell to pg's text form, i.e. `2020-01-02 03:04:05.678+00`. */
export function timestamptzCellAsPgText(chunk: Buffer, start: number): string {
  return renderTimestamp(chunk.readBigInt64BE(start), "+00");
}

/** Builds a days -> local-midnight `Date` decoder for date columns, mirroring postgres-date. */
function binaryDateToLocalDate(textParse: (value: any) => any): BinaryParse {
  return (chunk, start) => {
    const days = chunk.readInt32BE(start);
    if (days === INFINITY_DAYS) return textParse("infinity");
    if (days === NEG_INFINITY_DAYS) return textParse("-infinity");
    const [year, month, day] = civilFromDays(days + PG_EPOCH_DAYS);
    const date = new Date(year, month - 1, day);
    // Mirror postgres-date's fixup for years 0-99 being interpreted as 1900-1999
    if (year < 100) date.setFullYear(year);
    return date;
  };
}

/** Renders the cell bytes as a utf8 string, i.e. text-like types and unknown oids (enums, citext). */
function renderUtf8(chunk: Buffer, start: number, length: number): string {
  return chunk.toString("utf8", start, start + length);
}

/** Reads a float4 as its shortest round-trip decimal, matching pg's shortest text output. */
function readFloat4(chunk: Buffer, start: number): number {
  const value = chunk.readFloatBE(start);
  if (!Number.isFinite(value)) return value;
  // The raw float32 -> float64 widening (i.e. 0.1f -> 0.10000000149...) diverges from the text
  // path, which parses pg's shortest repr; find the shortest decimal that round-trips instead
  for (let precision = 1; precision <= 8; precision++) {
    const shortest = Number(value.toPrecision(precision));
    if (Math.fround(shortest) === value) return shortest;
  }
  return value;
}

/** Copies the exact cell bytes, i.e. for bytea values. */
function copyBytes(chunk: Buffer, start: number, length: number): Buffer {
  const cell = Buffer.allocUnsafe(length);
  chunk.copy(cell, 0, start, start + length);
  return cell;
}

/** Renders a binary uuid (16 bytes) as the canonical dashed-hex string. */
function renderUuid(chunk: Buffer, start: number): string {
  const hex = chunk.toString("hex", start, start + 16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Renders a binary numeric (base-10000 digit groups) to pg's text form, i.e. `-12.340`. */
function renderNumeric(chunk: Buffer, start: number): string {
  const nDigits = chunk.readInt16BE(start);
  const weight = chunk.readInt16BE(start + 2);
  const sign = chunk.readUInt16BE(start + 4);
  const dscale = chunk.readUInt16BE(start + 6);
  if (sign === 0xc000) return "NaN";
  if (sign === 0xd000) return "Infinity";
  if (sign === 0xf000) return "-Infinity";
  // Integer part: digit groups from `weight` down to 0 (missing groups are zero)
  let integer = "";
  for (let w = weight, i = 0; w >= 0; w--, i++) {
    const group = i < nDigits ? chunk.readUInt16BE(start + 8 + i * 2) : 0;
    integer += integer === "" ? String(group) : String(group).padStart(4, "0");
  }
  if (integer === "") integer = "0";
  if (dscale === 0) return sign === 0x4000 ? `-${integer}` : integer;
  // Fraction part: the group at weight -k is digits[weight + k]; pad/trim to exactly `dscale` digits
  let fraction = "";
  for (let k = 1; fraction.length < dscale; k++) {
    const i = weight + k;
    const group = i >= 0 && i < nDigits ? chunk.readUInt16BE(start + 8 + i * 2) : 0;
    fraction += String(group).padStart(4, "0");
  }
  fraction = fraction.slice(0, dscale);
  return `${sign === 0x4000 ? "-" : ""}${integer}.${fraction}`;
}

/** Renders days-since-1970 as `YYYY-MM-DD`. */
function renderDate(epochDays: number): string {
  const [year, month, day] = civilFromDays(epochDays);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Renders a binary timestamp (µs since 2000-01-01) to pg's text form, i.e. `2020-01-02 03:04:05.678+00`. */
function renderTimestamp(pgMicros: bigint, suffix: string): string {
  if (pgMicros === INFINITY_US) return "infinity";
  if (pgMicros === NEG_INFINITY_US) return "-infinity";
  const epochMicros = pgMicros + PG_EPOCH_US;
  let days = epochMicros / US_PER_DAY;
  let micros = epochMicros % US_PER_DAY;
  if (micros < 0n) {
    days -= 1n;
    micros += US_PER_DAY;
  }
  const date = renderDate(Number(days));
  const us = Number(micros);
  const seconds = Math.floor(us / 1_000_000);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds / 60) % 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  // pg renders up to 6 fractional digits with trailing zeros trimmed, and no "." when zero
  let fraction = "";
  const usPart = us % 1_000_000;
  if (usPart > 0) fraction = `.${String(usPart).padStart(6, "0")}`.replace(/0+$/, "");
  return `${date} ${hh}:${mm}:${ss}${fraction}${suffix}`;
}

/** Converts days-since-1970 to a civil [year, month, day], i.e. Howard Hinnant's algorithm. */
function civilFromDays(epochDays: number): [number, number, number] {
  const z = epochDays + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [m <= 2 ? y + 1 : y, m, d];
}

/** Renders a binary tsvector (lexeme cstrings + position/weight words) to pg's text form, i.e. `'new':2A`. */
function renderTsVector(chunk: Buffer, start: number): string {
  const count = chunk.readInt32BE(start);
  let pos = start + 4;
  const lexemes: string[] = [];
  for (let i = 0; i < count; i++) {
    const end = chunk.indexOf(0, pos);
    const word = chunk.toString("utf8", pos, end).replace(/'/g, "''");
    pos = end + 1;
    const nPositions = chunk.readUInt16BE(pos);
    pos += 2;
    const positions: string[] = [];
    for (let p = 0; p < nPositions; p++) {
      // Each word entry packs the weight in the top 2 bits (3=A, 2=B, 1=C, 0=D/default)
      const entry = chunk.readUInt16BE(pos);
      pos += 2;
      positions.push(`${entry & 0x3fff}${weightSuffixes[entry >> 14]}`);
    }
    lexemes.push(positions.length > 0 ? `'${word}':${positions.join(",")}` : `'${word}'`);
  }
  return lexemes.join(" ");
}

const weightSuffixes = ["", "C", "B", "A"];

/** Renders a binary range (flags byte + length-prefixed bounds) to pg's text form, i.e. `["a","b")`. */
function renderRange(chunk: Buffer, start: number, bound: (c: Buffer, s: number) => string): string {
  const flags = chunk[start];
  if (flags & 0x01) return "empty";
  let pos = start + 1;
  let lower = "";
  let upper = "";
  if (!(flags & 0x08)) {
    const len = chunk.readInt32BE(pos);
    lower = bound(chunk, pos + 4);
    pos += 4 + len;
  }
  if (!(flags & 0x10)) {
    upper = bound(chunk, pos + 4);
  }
  return `${flags & 0x02 ? "[" : "("}${lower},${upper}${flags & 0x04 ? "]" : ")"}`;
}

/** Renders a binary array to pg's `{...}` literal, quoting every element for unambiguous parsing. */
function renderArrayLiteral(chunk: Buffer, start: number, length: number): string {
  const nDims = chunk.readInt32BE(start);
  if (nDims === 0) return "{}";
  const elemOid = chunk.readInt32BE(start + 8);
  const dims: number[] = [];
  for (let d = 0; d < nDims; d++) dims.push(chunk.readInt32BE(start + 12 + d * 8));
  const elemRender = textRenderers[elemOid] ?? renderUtf8;
  let pos = start + 12 + nDims * 8;
  function renderDim(dim: number): string {
    const parts: string[] = [];
    for (let i = 0; i < dims[dim]; i++) {
      if (dim < nDims - 1) {
        parts.push(renderDim(dim + 1));
      } else {
        const len = chunk.readInt32BE(pos);
        pos += 4;
        if (len === -1) {
          parts.push("NULL");
        } else {
          const text = elemRender(chunk, pos, len);
          pos += len;
          parts.push(`"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
        }
      }
    }
    return `{${parts.join(",")}}`;
  }
  return renderDim(0);
}
