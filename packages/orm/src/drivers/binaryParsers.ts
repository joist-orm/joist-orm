import { requireTemporal } from "joist-core";

/**
 * Joist's registry of PostgreSQL *binary-format* cell parsers, used by `WireRowData` for lazy
 * `em.find`/`em.load` results (which request binary output; see `executeRowDataQuery`).
 *
 * This registry is deliberately **separate from `pg.types`**: `pg.types.setTypeParser` and
 * pool/client `TypeOverrides` continue to govern classic *text* results (knex, `pool.query`,
 * non-lazy drivers), while binary cells decode wire-bytes -> values directly — ints via
 * `readInt32BE`, timestamps via µs arithmetic, Temporal values constructed without ever
 * materializing a string. There is no fallback from one registry to the other:
 *
 * - Built-in parsers cover the standard scalar/array types below; `setupLatestPgTypes`
 *   registers the date/time parsers appropriate to Date-vs-Temporal mode.
 * - Custom/extension types (native enums, citext, domains, hstore, ...) must be registered
 *   explicitly with {@link setBinaryTypeParser} — text-like types can use
 *   {@link binaryTextParser}, arrays of registered elements can use {@link binaryArrayParser}.
 * - A query selecting a column whose oid has no registered parser **fails** with a descriptive
 *   error (see `WireRowData.setRowDescription`), rather than guessing at a lossy decoding.
 *
 * Values produced here should match what the classic text path produces for the same column
 * (i.e. `numeric` stays a string, `int8` stays a string, Date-mode timestamps become `Date`s),
 * so entities hydrate identically in either mode; Temporal-mode parsers construct
 * `Temporal.PlainDate`/`ZonedDateTime`/etc. directly, and the temporal mappers pass
 * already-constructed instances through.
 */
export function setBinaryTypeParser(oid: number, parse: BinaryParse): void {
  parsers.set(oid, parse);
}

/** Returns the registered binary parser for `oid`, i.e. for tests to save/restore. */
export function getBinaryTypeParser(oid: number): BinaryParse | undefined {
  return parsers.get(oid);
}

/** Decodes one binary cell directly from the payload chunk; `length` is the cell's byte length. */
export type BinaryParse = (chunk: Buffer, start: number, length: number) => any;

/**
 * Auto-registers binary parsers for the database's text-like dynamic-oid types — native enums
 * and citext, plus their array types — so apps get those for free.
 *
 * `PostgresDriver` calls this lazily before its first lazy query; apps can also call it
 * directly (i.e. at boot) if they want the registrations eagerly. Explicit
 * `setBinaryTypeParser` registrations are never overwritten.
 */
export async function registerDatabaseBinaryParsers(pool: {
  query(sql: string): Promise<{ rows: any[] }>;
}): Promise<void> {
  // Also capture the session's TimeZone, which zones temporal-mode timestamptz loads to match
  // what classic text parsing would have produced (pg renders timestamps in the session zone)
  const [{ rows: settings }, { rows }] = await Promise.all([
    pool.query(`select current_setting('TimeZone') as tz`),
    pool.query(
      `select t.oid, t.typarray
       from pg_type t
       where t.typtype = 'e'
          or t.typname = 'citext'
          or (t.typtype = 'd' and (select b.typcategory from pg_type b where b.oid = t.typbasetype) = 'S')`,
    ),
  ]);
  setSessionTimeZone(settings[0].tz);
  for (const row of rows) {
    const oid = Number(row.oid);
    if (getBinaryTypeParser(oid) === undefined) setBinaryTypeParser(oid, binaryTextParser);
    const arrayOid = Number(row.typarray);
    if (arrayOid !== 0 && getBinaryTypeParser(arrayOid) === undefined) {
      setBinaryTypeParser(arrayOid, binaryArrayParser);
    }
  }
}

/**
 * Sets the session `TimeZone` used to zone temporal-mode `timestamptz` loads; normally captured
 * automatically by {@link registerDatabaseBinaryParsers}. One zone per process — pools with
 * differing session TimeZones are not supported by the binary path.
 */
export function setSessionTimeZone(timeZone: string): void {
  sessionTimeZone = timeZone === "Etc/UTC" ? "UTC" : timeZone;
}

let sessionTimeZone = "UTC";

/** Decodes a cell's bytes as utf8 text, i.e. for text-like custom types (enums, citext, domains). */
export function binaryTextParser(chunk: Buffer, start: number, length: number): string {
  return chunk.toString("utf8", start, start + length);
}

/**
 * Decodes a binary array cell into a JS array of element values.
 *
 * The element oid is embedded in the wire format, and each element decodes through this
 * registry — so arrays of any registered type (including custom-registered oids and the
 * mode-appropriate temporal types) work without separate element wiring. Registered for the
 * standard `_type` oids below; register it for custom array oids as needed.
 */
export function binaryArrayParser(chunk: Buffer, start: number, length: number): any[] {
  const nDims = chunk.readInt32BE(start);
  if (nDims === 0) return [];
  const elemOid = chunk.readInt32BE(start + 8);
  const parse =
    parsers.get(elemOid) ??
    fail(`joist-orm: no binary type parser registered for array element oid ${elemOid}; see setBinaryTypeParser`);
  const dims: number[] = [];
  for (let d = 0; d < nDims; d++) dims.push(chunk.readInt32BE(start + 12 + d * 8));
  let pos = start + 12 + nDims * 8;
  function readDim(dim: number): any[] {
    const values: any[] = [];
    for (let i = 0; i < dims[dim]; i++) {
      if (dim < nDims - 1) {
        values.push(readDim(dim + 1));
      } else {
        const len = chunk.readInt32BE(pos);
        pos += 4;
        if (len === -1) {
          values.push(null);
        } else {
          values.push(parse(chunk, pos, len));
          pos += len;
        }
      }
    }
    return values;
  }
  return readDim(0);
}

/** Decodes binary `date` cells to `Date`s, matching postgres-date's text semantics; Date mode. */
export function binaryDateToDate(chunk: Buffer, start: number): any {
  const days = chunk.readInt32BE(start);
  if (days === INFINITY_DAYS) return Infinity;
  if (days === NEG_INFINITY_DAYS) return -Infinity;
  const [year, month, day] = civilFromDays(days + PG_EPOCH_DAYS);
  const date = new Date(year, month - 1, day);
  // Mirror postgres-date's fixup for years 0-99 being interpreted as 1900-1999
  if (year < 100) date.setFullYear(year);
  return date;
}

/** Decodes binary `timestamp` (without zone) cells to local-time `Date`s; Date mode. */
export function binaryTimestampToDate(chunk: Buffer, start: number): any {
  const pgMicros = chunk.readBigInt64BE(start);
  if (pgMicros === INFINITY_US) return Infinity;
  if (pgMicros === NEG_INFINITY_US) return -Infinity;
  const { days, us } = splitPgMicros(pgMicros);
  const [year, month, day] = civilFromDays(days);
  const seconds = Math.floor(us / 1_000_000);
  const date = new Date(
    year,
    month - 1,
    day,
    Math.floor(seconds / 3600),
    Math.floor((seconds / 60) % 60),
    seconds % 60,
    Math.floor((us % 1_000_000) / 1000),
  );
  if (year < 100) date.setFullYear(year);
  return date;
}

/** Decodes binary `timestamptz` cells to `Date`s (µs floor to ms, like the text parse); Date mode. */
export function binaryTimestamptzToDate(chunk: Buffer, start: number): any {
  const pgMicros = chunk.readBigInt64BE(start);
  if (pgMicros === INFINITY_US) return Infinity;
  if (pgMicros === NEG_INFINITY_US) return -Infinity;
  const epochMicros = pgMicros + PG_EPOCH_US;
  let ms = epochMicros / 1000n;
  if (epochMicros % 1000n < 0n) ms -= 1n;
  return new Date(Number(ms));
}

/**
 * Registers the Temporal-mode binary parsers: date/time/timestamp/timestamptz cells construct
 * `Temporal` values *directly* from the wire µs/days — no intermediate strings, no
 * `temporalMappers.fromDb` parsing (the mappers pass already-constructed instances through).
 *
 * `timestamptz` matches the text path's zoning exactly: classic parsing zones the value by the
 * offset the session's `TimeZone` rendered (normalizing `+00` to `UTC`), so we compute the
 * session zone's offset at each instant (see `setSessionTimeZone`; the configured
 * `temporal.timeZone` only governs `now`-conversions, not loads).
 */
export function registerTemporalBinaryParsers(): void {
  const { Temporal: t } = requireTemporal();
  setBinaryTypeParser(oids.DATE, (chunk, start) => {
    const days = chunk.readInt32BE(start);
    if (days === INFINITY_DAYS || days === NEG_INFINITY_DAYS) failTemporalInfinity("date");
    const [year, month, day] = civilFromDays(days + PG_EPOCH_DAYS);
    return new t.PlainDate(year, month, day);
  });
  setBinaryTypeParser(1083 /* time */, (chunk, start) => {
    const us = Number(chunk.readBigInt64BE(start));
    const seconds = Math.floor(us / 1_000_000);
    return new t.PlainTime(
      Math.floor(seconds / 3600),
      Math.floor((seconds / 60) % 60),
      seconds % 60,
      Math.floor((us % 1_000_000) / 1000),
      us % 1000,
    );
  });
  setBinaryTypeParser(oids.TIMESTAMP, (chunk, start) => {
    const pgMicros = chunk.readBigInt64BE(start);
    if (pgMicros === INFINITY_US || pgMicros === NEG_INFINITY_US) failTemporalInfinity("timestamp");
    const { days, us } = splitPgMicros(pgMicros);
    const [year, month, day] = civilFromDays(days);
    const seconds = Math.floor(us / 1_000_000);
    return new t.PlainDateTime(
      year,
      month,
      day,
      Math.floor(seconds / 3600),
      Math.floor((seconds / 60) % 60),
      seconds % 60,
      Math.floor((us % 1_000_000) / 1000),
      us % 1000,
    );
  });
  setBinaryTypeParser(oids.TIMESTAMPTZ, (chunk, start) => {
    const pgMicros = chunk.readBigInt64BE(start);
    if (pgMicros === INFINITY_US || pgMicros === NEG_INFINITY_US) failTemporalInfinity("timestamptz");
    const instant = t.Instant.fromEpochNanoseconds((pgMicros + PG_EPOCH_US) * 1000n);
    if (sessionTimeZone === "UTC") return instant.toZonedDateTimeISO("UTC");
    // Zone by the session zone's offset at this instant, i.e. what pg's text rendering carries
    const zoned = instant.toZonedDateTimeISO(sessionTimeZone);
    const { offset } = zoned;
    return offset === "+00:00" ? zoned.withTimeZone("UTC") : zoned.withTimeZone(offset);
  });
}

// Microseconds between the Postgres epoch (2000-01-01) and the Unix epoch (1970-01-01)
const PG_EPOCH_US = 946_684_800_000_000n;
const PG_EPOCH_DAYS = 10_957;
const US_PER_DAY = 86_400_000_000n;
// The wire sentinels for `infinity` / `-infinity` timestamps and dates
const INFINITY_US = 0x7fffffffffffffffn;
const NEG_INFINITY_US = -0x8000000000000000n;
const INFINITY_DAYS = 0x7fffffff;
const NEG_INFINITY_DAYS = -0x80000000;

// pg's builtin oids, inlined to avoid importing pg here (these are protocol constants)
const oids = {
  BOOL: 16,
  BYTEA: 17,
  INT8: 20,
  INT2: 21,
  INT4: 23,
  TEXT: 25,
  OID: 26,
  JSON: 114,
  FLOAT4: 700,
  FLOAT8: 701,
  BPCHAR: 1042,
  VARCHAR: 1043,
  DATE: 1082,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  NUMERIC: 1700,
  UUID: 2950,
  JSONB: 3802,
};

const parsers = new Map<number, BinaryParse>();

// The standard scalar builtins; values match what the classic text path produces for the same
// column, i.e. int8/numeric stay strings, bytea stays a Buffer (byte-exact, where classic pg's
// binary handling is utf8-lossy)
setBinaryTypeParser(oids.BOOL, (chunk, start) => chunk[start] !== 0);
setBinaryTypeParser(oids.INT2, (chunk, start) => chunk.readInt16BE(start));
setBinaryTypeParser(oids.INT4, (chunk, start) => chunk.readInt32BE(start));
setBinaryTypeParser(oids.OID, (chunk, start) => chunk.readUInt32BE(start));
setBinaryTypeParser(oids.INT8, (chunk, start) => chunk.readBigInt64BE(start).toString());
setBinaryTypeParser(oids.FLOAT4, (chunk, start) => readFloat4(chunk, start));
setBinaryTypeParser(oids.FLOAT8, (chunk, start) => chunk.readDoubleBE(start));
setBinaryTypeParser(oids.TEXT, binaryTextParser);
setBinaryTypeParser(oids.VARCHAR, binaryTextParser);
setBinaryTypeParser(oids.BPCHAR, binaryTextParser);
setBinaryTypeParser(19 /* name */, binaryTextParser);
setBinaryTypeParser(oids.UUID, (chunk, start) => renderUuid(chunk, start));
setBinaryTypeParser(oids.BYTEA, copyBytes);
setBinaryTypeParser(oids.JSON, (chunk, start, length) => JSON.parse(chunk.toString("utf8", start, start + length)));
// jsonb payloads have a 1-byte version prefix before the JSON text
setBinaryTypeParser(oids.JSONB, (chunk, start, length) =>
  JSON.parse(chunk.toString("utf8", start + 1, start + length)),
);
setBinaryTypeParser(oids.NUMERIC, renderNumeric);
setBinaryTypeParser(3614 /* tsvector */, renderTsVector);
setBinaryTypeParser(3910 /* tstzrange */, (chunk, start) =>
  renderRange(chunk, start, (c, s) => {
    // pg quotes finite bounds (they contain spaces) but renders infinity bounds bare
    const text = renderTimestamp(c.readBigInt64BE(s), "+00");
    return text === "infinity" || text === "-infinity" ? text : `"${text}"`;
  }),
);
// Rendered like pg's text output, which is also what the classic text path yields (no parser)
setBinaryTypeParser(1083 /* time */, (chunk, start) => renderTimeOfDay(Number(chunk.readBigInt64BE(start))));

// The standard `_type` array oids; elements decode through the registry (see binaryArrayParser)
for (const arrayOid of [
  1000, // bool[]
  1001, // bytea[]
  1005, // int2[]
  1007, // int4[]
  1009, // text[]
  1014, // bpchar[]
  1015, // varchar[]
  1016, // int8[]
  1021, // float4[]
  1022, // float8[]
  1182, // date[]
  1183, // time[]
  1115, // timestamp[]
  1185, // timestamptz[]
  1231, // numeric[]
  2951, // uuid[]
  199, // json[]
  3807, // jsonb[]
  3643, // tsvector[]
  3911, // tstzrange[]
]) {
  setBinaryTypeParser(arrayOid, binaryArrayParser);
}

// Default the date/time oids to Date-mode semantics; `setupLatestPgTypes` re-registers the
// Temporal-mode parsers when the app runs with `temporal` configured
setBinaryTypeParser(oids.DATE, binaryDateToDate);
setBinaryTypeParser(oids.TIMESTAMP, binaryTimestampToDate);
setBinaryTypeParser(oids.TIMESTAMPTZ, binaryTimestamptzToDate);

/** Splits pg timestamp µs into days-since-1970 and µs-within-day, flooring correctly pre-epoch. */
function splitPgMicros(pgMicros: bigint): { days: number; us: number } {
  const epochMicros = pgMicros + PG_EPOCH_US;
  let days = epochMicros / US_PER_DAY;
  let micros = epochMicros % US_PER_DAY;
  if (micros < 0n) {
    days -= 1n;
    micros += US_PER_DAY;
  }
  return { days: Number(days), us: Number(micros) };
}

/** Fails on the ±infinity wire sentinels, which have no Temporal representation. */
function failTemporalInfinity(type: string): never {
  return fail(`joist-orm: cannot represent an 'infinity' ${type} as a Temporal value`);
}

/** Reads a float4 as its shortest round-trip decimal, matching pg's shortest text output. */
function readFloat4(chunk: Buffer, start: number): number {
  const value = chunk.readFloatBE(start);
  if (!Number.isFinite(value)) return value;
  // ±0 as-is: toPrecision would drop -0's sign, and === cannot tell the zeros apart
  if (value === 0) return value;
  // The raw float32 -> float64 widening (i.e. 0.1f -> 0.10000000149...) diverges from the text
  // path, which parses pg's shortest repr; find the shortest decimal that round-trips instead
  // (binary32 needs at most 9 significant decimal digits)
  for (let precision = 1; precision <= 9; precision++) {
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

/** Renders a binary tsvector (lexeme cstrings + position/weight words) to pg's text form, i.e. `'new':2A`. */
function renderTsVector(chunk: Buffer, start: number): string {
  const count = chunk.readInt32BE(start);
  let pos = start + 4;
  const lexemes: string[] = [];
  for (let i = 0; i < count; i++) {
    const end = chunk.indexOf(0, pos);
    // pg's output doubles both backslashes and quotes inside lexemes
    const word = chunk.toString("utf8", pos, end).replace(/\\/g, "\\\\").replace(/'/g, "''");
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

/** Renders days-since-1970 as pg's date text, i.e. `2020-01-02` or `0001-01-01 BC`. */
function renderDate(epochDays: number): string {
  const { text, bc } = renderDatePart(epochDays);
  return bc ? `${text} BC` : text;
}

/**
 * Renders the `YYYY-MM-DD` part, converting astronomical years to pg's BC numbering
 * (astronomical year 0 = `0001 BC`); timestamps append the ` BC` marker after the time/zone.
 */
function renderDatePart(epochDays: number): { text: string; bc: boolean } {
  const [year, month, day] = civilFromDays(epochDays);
  const bc = year <= 0;
  const displayYear = bc ? 1 - year : year;
  return {
    text: `${String(displayYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    bc,
  };
}

/** Renders a binary timestamp (µs since 2000-01-01) to pg's text form, i.e. `2020-01-02 03:04:05.678+00`. */
function renderTimestamp(pgMicros: bigint, suffix: string): string {
  if (pgMicros === INFINITY_US) return "infinity";
  if (pgMicros === NEG_INFINITY_US) return "-infinity";
  const { days, us } = splitPgMicros(pgMicros);
  const { text: date, bc } = renderDatePart(days);
  return `${date} ${renderTimeOfDay(us)}${suffix}${bc ? " BC" : ""}`;
}

/** Renders µs-since-midnight to pg's time text, i.e. `03:04:05.678` with trailing zeros trimmed. */
function renderTimeOfDay(us: number): string {
  const seconds = Math.floor(us / 1_000_000);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds / 60) % 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  // pg renders up to 6 fractional digits with trailing zeros trimmed, and no "." when zero
  let fraction = "";
  const usPart = us % 1_000_000;
  if (usPart > 0) fraction = `.${String(usPart).padStart(6, "0")}`.replace(/0+$/, "");
  return `${hh}:${mm}:${ss}${fraction}`;
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

/** Throws an `Error` with `message`. */
function fail(message: string): never {
  throw new Error(message);
}
