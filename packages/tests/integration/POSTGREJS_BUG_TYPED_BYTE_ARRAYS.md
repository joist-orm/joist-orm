# PostgreJS: typed byte-array parameters are inferred as JSON and explicit bytea fails

## Summary and scope

Passing a `Uint8Array` as a `bytea` parameter fails because PostgreJS infers JSON.
An explicit `BindParam(17, value)` does not resolve the problem: the bytea encoder
then throws `buffer.copy is not a function`. Arrays of Uint8Array values are
similarly inferred as `json[]` rather than `bytea[]`.

**This is a supported-input/compatibility gap, not confirmed corruption of
documented Buffer inputs.** PostgreJS's current `ByteaType` declares its JavaScript
type as `Buffer` and only recognizes Buffers. Buffer inputs work. This report asks
for native support for ordinary byte views, or a clear unsupported-input error,
rather than claiming PostgreJS already promises to accept every ArrayBuffer view.

Joist accepts binary views and node-pg handles them as binary parameters, so Joist
currently normalizes them before passing them to PostgreJS.

## Environment

Reproduced on 2026-10-24 with installed PostgreJS `3.14.0`, Node `v26.3.1`, and
PostgreSQL `16.0` on Linux. This is independent of timezone. No Joist code,
custom type map, or schema migration is required.

## Reproduction

Save the following as `reproduce.mjs` in a project with PostgreJS installed:

```sh
DATABASE_URL=postgres://user:password@localhost/database node reproduce.mjs
```

```js
import { BindParam, Pool } from "postgrejs";

const pool = new Pool(process.env.DATABASE_URL);
const backing = new Uint8Array([42, 0, 128, 255, 43]);
const bytes = backing.subarray(1, 4);
const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const scalarSql = "select encode($1::bytea, 'hex') as value";
const arraySql = "select encode(($1::bytea[])[1], 'hex') as value";
const cases = [
  ["Uint8Array", scalarSql, bytes],
  ["Explicit bytea", scalarSql, new BindParam(17, bytes)],
  ["Uint8Array array", arraySql, [bytes]],
  ["Buffer view", scalarSql, buffer],
  ["Buffer array", arraySql, [buffer]],
];

try {
  for (const [name, sql, value] of cases) {
    try {
      const result = await pool.query(sql, { params: [value], rowDecoder: "object" });
      console.log(name, result.rows[0].value);
    } catch (error) {
      console.log(name, error.code ?? "client error", error.message.split("\n")[0]);
    }
  }
} finally {
  await pool.close();
}
```

Observed output:

```text
Uint8Array 42846 cannot cast type json to bytea
Explicit bytea client error buffer.copy is not a function
Uint8Array array 42846 cannot cast type json[] to bytea[]
Buffer view 0080ff
Buffer array 0080ff
```

For a binary-input API accepting Uint8Array, each case should return `0080ff`.
The leading/trailing bytes `42` and `43` are outside the view and must not be sent.

## Cause

In the installed `data-types/bytea-type.js`, `ByteaType.isType` tests
`v instanceof Buffer`. Uint8Array fails that test and falls through to JSON
inference. Explicitly selecting the bytea OID reaches `encodeBinary`, but its
buffer writer still expects Buffer methods.

## Joist workaround

`prepareValue` converts non-Buffer ArrayBuffer views with:

```js
Buffer.from(value.buffer, value.byteOffset, value.byteLength)
```

This creates a Buffer view over exactly the selected bytes without copying the
payload. The conversion is recursive for array parameters, including nested
arrays. It also handles DataView/other typed views according to Joist's existing
binary-input convention; the minimal reproduction above specifically verifies
Uint8Array and a nonzero byte offset.

## Requested upstream behavior

Support Uint8Array in bytea inference and encoding, including explicit BindParam
and bytea arrays. Preserve the view's offset and length. If broader binary views
are intentionally unsupported, reject them with a clear supported-input message
instead of inferring JSON or failing with a low-level Buffer method error.
