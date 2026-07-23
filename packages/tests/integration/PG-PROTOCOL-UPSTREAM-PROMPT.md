# Prompt: upstream lazy DataRow decoding to pg-protocol

The following is a self-contained prompt for preparing an upstream PR against
https://github.com/brianc/node-postgres (the `packages/pg-protocol` workspace). Paste everything
below the line into a session running in a node-postgres checkout.

---

I'd like to prepare a small, backward-compatible performance PR against `packages/pg-protocol`:
**defer per-cell string decoding of `DataRow` messages until the `fields` array is actually
read**. Please implement it, benchmark it, and draft the PR description.

## The problem

`parseDataRowMessage` in `packages/pg-protocol/src/parser.ts` eagerly materializes a JS string
for every non-null cell of every row (`reader.string(len)` per column), plus a `fields` array
and a `DataRowMessage` object per row, at parse time. For consumers that don't read every cell
as a string, that work is pure overhead, and for large result sets it dominates end-to-end query
time:

- Measured against a local Postgres (Node v26, `select * from <table>` with 100k rows × ~40
  columns): server-side execution is ~7 ms and the wire transfer floor is ~60-90 ms, but
  `pool.query` takes ~320 ms — i.e. roughly ~250 ms is the JS decode/materialization layer, of
  which POJO row assembly is only ~50 ms (`rowMode: "array"` is ~270 ms). The per-cell string
  materialization is the dominant term: ~4M cell strings for this result.
- Consumers exist that want the raw cell bytes without eager strings: ORMs decoding lazily on
  field access (Joist measured its 100k-row find going 378 ms → 148 ms once DataRow decoding was
  deferred, with GC-traced heap for the held result dropping ~3.4×), streaming/cursor consumers,
  and binary-ish workloads (see #2240's bytea allocation complaints, and #2093 asking how to
  avoid result materialization).

## The proposed change

Make `DataRowMessage` carry the raw payload range and decode lazily via a memoized getter,
instead of receiving pre-decoded fields:

1. In `packages/pg-protocol/src/messages.ts`, change `DataRowMessage` to:

   - store `bytes: Buffer` (the parser's buffer) and `offset: number` (the payload start, i.e.
     pointing at the `int16 fieldCount`), read `fieldCount` from the payload in the constructor,
     and
   - expose `fields: (string | null)[]` as a **memoized getter** that walks the length-prefixed
     cells (`int32 len` then `len` bytes; `len === -1` is SQL NULL) decoding each cell with
     `bytes.toString("utf8", start, end)` — byte-for-byte what `BufferReader.string` produces
     today — caching the array on first access.

2. In `packages/pg-protocol/src/parser.ts`, change `parseDataRowMessage` to skip all cell
   decoding and construct the lazy message from the payload range. (In the current source the
   per-message parsers take a `reader`; the DataRow case needs the underlying `(buffer, offset)`
   instead — either pass them through or special-case DataRow in `handlePacket`, whichever reads
   cleaner in the current code structure.)

3. Preserve the public shape: `name === "dataRow"`, `fieldCount`, `length`, and `fields` all
   behave identically for existing consumers. If anything outside the parser constructs
   `DataRowMessage(length, fields)` directly (tests do), either keep a compatible constructor
   overload (second arg is an array → legacy behavior) or update the tests — maintainer's
   preference.

Why this is safe:

- pg's only consumer, `Result.parseRow(msg.fields)` in `packages/pg/lib/query.js`
  (`handleDataRow`), reads `fields` synchronously in the same tick as parsing — before
  `Parser.mergeBuffer` can reuse or overwrite the buffer on a later `data` chunk. That same-tick
  consumption is already the de-facto contract (the parser's buffer reuse means retained
  messages were never safe to lazily inspect); the PR should document it on the getter: "valid
  within the same tick as parsing; reading `fields` then is identical to today's eager decode."
- The getter memoizes, so repeated `fields` access decodes once.
- Cells decode with the same UTF-8 semantics as `BufferReader.string`; include a test with
  multi-byte UTF-8, an empty string cell (`len === 0`), and a NULL cell (`len === -1`).

## Desirable option: retainable DataRow views (zero-copy for consumers)

The lazy getter above still leaves messages valid only within the parse tick, because
`Parser.mergeBuffer` recycles its scratch buffer: when a frame straddles two socket chunks, the
parser copies the *entire* incoming chunk into a doubling scratch buffer and later compacts it
in place, overwriting the regions earlier messages point into. Measured against a live socket
(node v26, 57 MB / 200k-row result, ~64 KiB reads): only 2 of 928 chunks happened to start
exactly on a frame boundary, so a streaming result spends ~100% of its life in the recycled
scratch — any consumer wanting cell bytes past the tick must copy them out, a second userspace
memcpy on top of `mergeBuffer`'s own full-chunk copy.

The socket `'data'` buffers themselves are exact-sized, standalone GC-owned allocations
(928/928 in the same probe) that node never recycles, so a stronger design is possible and
desirable — in this PR if it stays small, otherwise as a follow-up:

- Always adopt the incoming chunk by reference (the `bufferLength === 0` path already does).
- When a frame straddles chunks, reassemble *only that frame* (~one per chunk) into a small
  side buffer, emit it, then continue parsing the rest of the new chunk in place — never copy
  whole chunks into scratch, never compact in place over emitted regions.
- Result: every fully-contained message references stable GC-owned memory, so the lazy
  `bytes`/`offset` views become retainable indefinitely (the "same tick only" footgun
  disappears), and zero-materialization consumers get true zero-copy row retention. Document
  the granularity: retaining one view pins its ~64 KiB chunk.

Scope notes if you attempt it: this reworks the exact buffer management the 2025 rewrite
touched for a memory-leak fix, so run the parser micro-benchmark before/after (the win for pg
itself is dropping `mergeBuffer`'s full-chunk copy; the win for lazy consumers is dropping
their copy-out), and add explicit straddle tests: header split across chunks, body split across
chunks, several frames per chunk, and a frame spanning 3+ chunks. If it grows beyond a
reviewable diff, land the lazy getter first and raise retainable views in the PR discussion.

## How to reproduce / benchmark

1. Unit-level: `packages/pg-protocol` has an inbound parser test suite
   (`src/inbound-parser.test.ts`) — extend it with the lazy/NULL/multi-byte cases above and make
   sure existing DataRow expectations still pass via the getter.
2. Micro-benchmark (add or adapt `packages/pg-protocol/src/b.ts`, the existing bench file):
   synthesize N = 100k DataRow frames of ~40 text cells each, and time `Parser.parse` with a
   callback that (a) never touches `fields` (the lazy win: expect order-of-magnitude less time
   and near-zero allocation), and (b) reads `fields` once per message (expect parity with
   today's eager decode, within noise — this is the "no regression for pg itself" number).
3. End-to-end sanity: `packages/pg`'s test suite must pass unchanged, since `Result.parseRow`
   exercises the getter on every row of every query.

## PR framing

- Title: something like "pg-protocol: defer DataRow cell decoding to a lazy `fields` getter".
- Motivation: cite the parse-cost numbers above; reference #2093 (avoiding result
  materialization), #2240 (allocation-heavy large cells), and note the maintainers' own parser
  performance work (#2151, and the 2025 parser buffer-management rewrite) as evidence this layer
  is performance-sensitive and actively maintained.
- Emphasize: zero behavior change for every existing consumer (same values, same tick, one
  extra property read per row), while enabling zero-materialization consumers (ORMs, cursors,
  streams) to read the payload range directly (`bytes`/`offset`/`fieldCount` become public).
- Downstream proof point: Joist ORM currently achieves this by monkey-patching
  `Parser.prototype.handlePacket` at runtime and would replace that with a
  `pg-protocol >= <released version>` requirement once this lands; its measured end-to-end win
  is 2.2-2.55× on 100k-1M row reads.
- Whether or not the retainable-views option ships in this PR, mention it in the description as
  the natural next step (it removes both the `mergeBuffer` full-chunk copy and lazy consumers'
  copy-out, and retires the "valid only this tick" caveat).

Please write the implementation against the current `master` source (note: the compiled 1.15.x
output shows the per-message parsers became module-level functions in the 2025 rewrite — work
from the TypeScript source, not vendored dist output), run the pg-protocol and pg test suites,
run the benchmark, and draft the PR description with the before/after numbers filled in.
