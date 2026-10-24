# PostgreJS: mixed Date/string arrays change values or fail by element order

## Summary

An array containing JavaScript `Date` objects and PostgreSQL date/timestamp
strings is not encoded element by element. The first non-null leaf determines
the formatter used for the entire array. This can:

- Change `"2024-01-02"` into `2024-01-01` in a non-UTC process timezone.
- Truncate `"2024-01-02 03:04:05.123456"` to millisecond precision.
- Fail with `time zone "gmt-0500" not recognized` when the string comes first
  and a later Date is encoded through its JavaScript string representation.

This is parameter encoding, not result decoding. The reproduction asks
PostgreSQL to return the received array as text, so the changed values are
visible before any client date decoder runs. The same inputs preserve their
values through node-pg.

## Environment

Reproduced on 2026-10-24 with installed PostgreJS `3.14.0`, Node `v26.3.1`, and
PostgreSQL `16.0` on Linux. The process timezone is `America/New_York`.
No Joist code, custom type map, or schema migration is required.

## Reproduction

Save the following as `reproduce.mjs` in a project with PostgreJS installed:

```sh
TZ=America/New_York DATABASE_URL=postgres://user:password@localhost/database node reproduce.mjs
```

```js
import { Pool } from "postgrejs";

const pool = new Pool(process.env.DATABASE_URL);
const date = new Date(2024, 0, 15, 12, 34, 56, 789);
const cases = [
  ["Date first", "date[]", [date, "2024-01-02"]],
  ["String first", "date[]", ["2024-01-02", date]],
  ["Microseconds", "timestamp[]", [date, "2024-01-02 03:04:05.123456"]],
  ["Nested", "date[][]", [[date, "2024-01-02"], [null, "2024-01-03"]]],
  ["Normalized dates", "date[]", ["2024-01-15T12:34:56.789-05:00", "2024-01-02"]],
  ["Normalized timestamps", "timestamp[]", ["2024-01-15T12:34:56.789-05:00", "2024-01-02 03:04:05.123456"]],
];

try {
  for (const [name, type, values] of cases) {
    try {
      const result = await pool.query(`select $1::${type}::text as value`, {
        params: [values],
        rowDecoder: "object",
      });
      console.log(name, result.rows[0].value);
    } catch (error) {
      console.log(name, error.code, error.message);
    }
  }
} finally {
  await pool.close();
}
```

Observed output:

```text
Date first {2024-01-15,2024-01-01}
String first 22023 time zone "gmt-0500" not recognized
Microseconds {"2024-01-15 12:34:56.789","2024-01-02 03:04:05.123"}
Nested {{2024-01-15,2024-01-01},{NULL,2024-01-02}}
Normalized dates {2024-01-15,2024-01-02}
Normalized timestamps {"2024-01-15 12:34:56.789","2024-01-02 03:04:05.123456"}
```

Expected:

- The Date represents January 15 at the process-local wall clock.
- The date strings retain their January 2/January 3 calendar dates.
- Timestamp strings retain all six fractional-second digits.
- Reversing element order reverses the returned elements, not whether encoding
  succeeds or how values are interpreted.

Separate node-pg controls returned `{2024-01-15,2024-01-02}`,
`{2024-01-02,2024-01-15}`, and the full `.123456` timestamp for the first
three cases.

## Cause

The installed `protocol/frontend.js` chooses the undeclared-array formatter with:

```js
writeArrayLiteral(io, v, queryOptions,
  arrayLeaf(v) instanceof Date ? formatDateParam : undefined);
```

`formatDateParam` coerces non-Date values through `new Date(value)` in
`util/format-datetime.js`. That interprets a date-only string as UTC midnight,
then renders it in the local timezone; New York therefore gets the previous
calendar day. Passing a timestamp string through Date also discards
microseconds. Conversely, selecting the ordinary string formatter from the
first element leaves later Date values with a JavaScript date string PostgreSQL
does not accept.

## Joist status after #2132

Joist fixed its marker serialization in #2132 (main commit `7b854dde`). Markers
now come from column codecs and have the same serialized representation as real
elements. Temporal arrays use deterministic strings, i.e. "2000-01-01", rather
than an invented Date object. The PostgreJS driver no longer converts Date
parameters to strings to compensate for this mismatch.

The native mixed-array behavior documented above is independent of that Joist
fix; the reproduction deliberately supplies mixed values directly to PostgreJS.

### Historical trigger and workaround

Joist's nullable-array bulk writes previously prepended a Date sentinel to
distinguish an empty array from a null array. Actual field values could be
date/timestamp strings, producing mixed arrays, including nested bulk arrays.

The sentinel is a temporary transport marker, not a date stored in the user's
column. `fillArrayWithNulls` pads the sub-arrays to equal lengths, then prepends
`null` for a null array and a type-compatible non-null value for a present array.
For example, with one padding slot and `M` denoting a non-null marker:

```text
NULL           -> [null, null]         -> NULL
[]             -> [M, null]            -> []
["2024-01-02"] -> [M, "2024-01-02"]   -> ["2024-01-02"]
```

The last step is `unnest_arrays(..., true)`: it checks the marker, removes it,
and removes padding. This protocol intentionally preserves NULL versus empty
arrays; it is not itself a Joist bug. The old `notNullMarker` chose `new Date()`
for date/timestamp columns without consulting their codecs. #2132 corrected that
representation mismatch at its source rather than changing the marker protocol.

Before #2132, `prepareValue` recursively converted each Date into a string
containing its local wall clock and explicit UTC offset, leaving existing strings
untouched. This prevented a Date formatter from coercing unrelated elements and
preserved microseconds. That workaround has been removed from Joist. The last two
reproduction cases still demonstrate string normalization for native callers
that intentionally supply mixed values.

## Requested upstream fix

Choose the text representation per leaf value when encoding undeclared arrays:
format Dates as Dates, preserve strings verbatim, and handle nulls and nesting
without changing this rule. Add real-database coverage for both element orders,
non-UTC process timezones, nested arrays, and microsecond timestamp strings.
