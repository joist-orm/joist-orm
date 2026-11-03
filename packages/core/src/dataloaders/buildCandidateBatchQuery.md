# Collection Find Batching

Concurrent `em.find` calls with the same query structure are batched. Duplicate calls reuse the same result. The **candidate phase** collects broad candidates and the values needed to check them. The **exact-match phase** compares those values with each call's filters and assigns matching call tags.

## Example: Two Finds, One Collection Lookup per Candidate

```ts
await Promise.all([
  em.find(Author, { books: { title: { in: ["one", "two"] } } }),
  em.find(Author, { books: { title: { in: ["two", "three"] } } }),
]);
```

Only the title list differs. First find authors with any title in `[one, two, three]`, then decide which caller each author belongs to. Simplified SQL (omitting soft deletes):

```sql
WITH _find(tag, arg0) AS MATERIALIZED (
  SELECT unnest($1::int[]), unnest_arrays($2::varchar[][])
),
_cand AS MATERIALIZED (
  SELECT a AS _entity, a.id AS _o0,
         ARRAY(SELECT b.title FROM books b
               WHERE b.author_id = a.id AND b.title = ANY($3::varchar[])) AS _c0
  FROM authors a
  WHERE EXISTS (
    SELECT 1 FROM books b
    WHERE b.author_id = a.id AND b.title = ANY($4::varchar[])
  )
),
_matched AS MATERIALIZED (
  SELECT c._entity, c._o0,
         ARRAY(SELECT f.tag FROM _find f WHERE c._c0 && f.arg0) AS _tags
  FROM _cand c
)
SELECT (m._entity).*, m._tags
FROM _matched m
WHERE cardinality(m._tags) > 0
ORDER BY m._o0;
```

Bindings: `$1 = [0, 1]`, `$2 = [["one", "two"], ["two", "three"]]`, and both `$3` and `$4` are `["one", "two", "three"]`. The existing `buildUnnestCte` helper supplies `_find` using bound arrays, so its SQL text does not change with batch size. This single-membership candidate query also has fixed SQL text.

For direct positive membership, the candidate phase collects only values requested by at least one call, while retaining shared child restrictions. Every call's list is a subset of that union, so trimming cannot change overlap results. For record arrays and no-children checks, the candidate phase retains the existing child filters.

An author with only title `one` gets tag `[0]`; an author with title `two` gets `[0, 1]`. `&&` tests whether two arrays share any value. It compares values already on the candidate row instead of querying `books` again for every caller.

Why the materialized CTEs:

- `_cand` keeps the candidate phase separate from the exact-match phase and final ordering. In the old CROSS JOIN / GROUP BY query, PostgreSQL could choose a primary-key walk across millions of rows to satisfy the grouping order. The candidate phase can instead use its selective filters and joins. Collecting child titles happens once per candidate, not once per candidate per caller.
- `_find` expands the argument arrays once. Without materialization, PostgreSQL can inline its `unnest` calls and repeat that expansion for every candidate.
- `_matched` implements the exact-match phase: it computes tags once, discards the candidate CTE's child-record arrays, and lets the final query filter empty tag arrays before ordering and the entity limit. Materialization prevents PostgreSQL from repeating the tag calculation in both the filter and the output. Only entity columns and tags cross the connection; record arrays and sort helpers stay in PostgreSQL.

During the candidate phase, shared child filters restrict both the entities and the collected child values. For example, if both callers also require `books.order = 1`, `_c0` collects only titles from books with order 1. A title from a different book must not satisfy that condition.

## Different Parent Filters with a Shared Collection Filter

The varying value can also be a parent column or a column from a to-one join:

```ts
await Promise.all([
  em.find(Author, { publisher: "p:1", books: { title: "shared" } }),
  em.find(Author, { publisher: "p:2", books: { title: "shared" } }),
]);
```

The candidate phase uses `a.publisher_id = ANY(ARRAY[1, 2])` together with the shared books `EXISTS`. It selects `a.publisher_id AS _c0`, rather than collecting an array of child values. The exact-match phase checks `c._c0 = ANY(f.arg0)`. The shared books filter runs during the candidate phase, not again for each call.

This also supports overlapping publisher `in` lists and filters such as `{ publisher: { name: "first" } }`: the candidate projects the joined name for the final comparison. When calls differ in both publisher and book title, an author must satisfy both filters from the same call.

## Which Conditions Need the Exact-Match Phase?

For `age > 20 AND books.title IN entryTitles`, the candidate phase already guarantees `age > 20`. The exact-match phase only needs the title comparison. This also works for a shared raw version filter such as `COALESCE(final_id, 2147483647) > ?`.

For `hasNoBooks OR books.title IN entryTitles`, being a candidate does not prove `hasNoBooks`: an author might have matched another caller's title list. Keep the no-books result on the candidate row and check `noBooks OR titlesOverlap` for each caller. Likewise, keep conditions inside an AND beneath an OR; candidate membership does not prove that branch is true.

## The Exact-Match Phase for Nested Filters

“Multiple varying conditions” means more than one filter value changes between callers. For example:

```ts
em.find(Author, { books: { title: "one", order: 1 } });
em.find(Author, { books: { title: "two", order: 2 } });
```

The candidate phase deliberately over-includes: `title IN [one, two] AND order IN [1, 2]` admits a book with `(title=one, order=2)` that neither caller requested. The exact-match phase compares against `_find` and removes that author unless another book satisfies one of the requested pairs. Simplified SQL:

```sql
WITH _find(tag, arg0, arg1) AS MATERIALIZED (
  SELECT unnest($1::int[]), unnest_arrays($2::varchar[][]), unnest_arrays($3::int[][])
), _cand AS MATERIALIZED (
  SELECT a AS _entity,
         ARRAY(SELECT ROW(b) FROM books b WHERE b.author_id = a.id) AS children
  FROM authors a
  WHERE EXISTS (
    SELECT 1 FROM books b WHERE b.author_id = a.id
    AND b.title = ANY($4::varchar[]) AND b."order" = ANY($5::int[])
  )
), _matched AS MATERIALIZED (
  SELECT c._entity, ARRAY(
    SELECT f.tag FROM _find f WHERE EXISTS (
      SELECT 1 FROM unnest(c.children) AS child(book books)
      WHERE (child.book).title = ANY(f.arg0) AND (child.book)."order" = ANY(f.arg1)
    )
  ) AS _tags FROM _cand c
)
SELECT (m._entity).*, m._tags FROM _matched m WHERE cardinality(m._tags) > 0;
```

Bindings: `$1 = [0, 1]`, `$2 = [["one"], ["two"]]`, `$3 = [[1], [2]]`, `$4 = ["one", "two"]`, `$5 = [1, 2]`. More calls add array elements, not OR branches. The SQL text stays fixed for the same query structure and set of filters that differ between calls.

The candidate phase projects `ARRAY(SELECT ROW(b) FROM books b WHERE b.author_id = a.id)` as a column in the candidate CTE. Each record contains the native `books` row. The exact-match phase evaluates the original AND against one child record at a time:

```sql
EXISTS (
  SELECT 1 FROM unnest(c._c0) AS child(book books)
  WHERE (child.book).title = ANY(f.arg0) AND (child.book)."order" = ANY(f.arg1)
)
```

An author with books `(one, 2)` and `(two, 1)` cannot satisfy `(one, 1)`: the title and order must come from the same record. These are PostgreSQL records, not JSON or JavaScript values. Native table rows retain attribute types, NULLs, and column-specific collations; declaring an anonymous field as just `text` would lose a non-default collation.

The compiler follows the same rules for every predicate tree:

- When calls filter the same column with different values, project that column's database value and compare it against each call's filter. I.e. for `age >= 30` and `age >= 40`, select the author's age into the candidate CTE once, then compare it against each threshold. Equality, IN/NOT IN, ranges, and other scalar operators use this path.
- AND/OR preserve the original grouping. Shared AND conditions stay in the candidate phase; shared branches beneath OR become projected booleans for the exact-match phase.
- An EXISTS whose filter values differ between calls projects child-record arrays and recursively compiles its filter. If calls use different review filters, each book record contains its own review-record array. Reviews cannot move between books during the exact-match phase.
- Independent collections have separate child-record arrays. Parent values and child predicates combine in the same AND/OR tree.
- A positive EXISTS directly on the candidate, containing only one changing eq/in after shared filters are removed, uses scalar-array overlap instead of record expansion. Nested scopes retain native rows because putting a scalar array inside an anonymous record would lose its column collation. This is a compact rendering of the exact-match phase, not a separate eligibility rule.

The candidate phase widens each condition independently while retaining the AND/OR grouping and positive EXISTS structure. **It never reads `_find`.** Its restrictions use ordinary bound values so PostgreSQL can plan the base-table search without looking through the materialized arguments. The exact-match phase is the only phase that reads `_find`.

### Candidate operator support

These rules apply only when filter values differ between calls. Shared conditions retain their original operators and values.

| Operator | Broad candidate restriction | Rationale |
| --- | --- | --- |
| `eq`, `in` | `IN` the distinct values from all calls | Includes every requested value without per-call SQL branches. |
| Numeric `gt`, `gte` | Use the lowest bound, keeping the operator | Any row accepted by a higher bound also passes the lowest bound. |
| Numeric `lt`, `lte` | Use the highest bound, keeping the operator | Any row accepted by a lower bound also passes the highest bound. |
| Numeric `between` | Lowest lower bound through highest upper bound | Includes gaps between calls' ranges; the exact-match phase removes those extra rows. |
| `ne`, `nin` | No restriction (`TRUE`) | Unioning exclusions loses valid candidates. Computing intersections would require PostgreSQL equality semantics, including collations. |
| Text/date/custom-type ranges, numeric strings, non-finite numbers | No restriction (`TRUE`) | JavaScript comparison or conversion could disagree with PostgreSQL ordering, precision, or collation. |
| Pattern matching, JSON-path predicates, and other scalar operators | No restriction (`TRUE`) | There is no implemented safe combined filter; the exact-match phase keeps the original PostgreSQL operator. |

Numeric bounds are combined only for built-in numeric database types whose encoded bindings are finite JavaScript numbers. Unsupported **candidate restrictions** do not make the operator unsupported overall: the exact-match phase still evaluates it. They can, however, admit many extra candidates, especially beneath OR. Array-valued arguments and other unsupported query shapes still fall back to regular batching as described below.

When a NOT EXISTS contains filter values that differ between calls, the candidate phase drops that restriction entirely and leaves it to the exact-match phase. Widening the filter inside NOT EXISTS would instead exclude valid candidates. Shared NOT EXISTS conditions remain in the candidate phase.

The final tag filter precedes ordering and the entity limit. This is required because extra candidates must not consume the entity limit or reach entity hydration.

## Current Limits and Performance Tradeoffs

The broad candidate strategy avoids repeating complete filters for each call, but can select more authors and collect more child rows than the exact-OR strategy. This is especially important when filters are highly correlated or a restriction must be dropped. Native child rows also use more backend memory than the single-column arrays used for overlap comparisons. This approach needs a production comparison against the previous exact-OR implementation; fixed SQL text alone does not establish a speedup.

Other exclusions have different reasons; they are not all fundamental limits:

| Shape | Why it falls back today / what broader support needs |
| --- | --- |
| Changing array-valued columns or membership lists containing NULL | The rectangular `_find` argument encoding removes padding NULLs and does not preserve arbitrary nested array dimensions. These need a lossless argument encoding before using the exact-match phase. |
| Joined projections, including CTI and plugin selects | An implementation limit: carry each selected value through the candidate CTE with unambiguous names and preserve the hydration layout. To-one joined **ordering** is supported by carrying sort columns through the CTE. |
| Actual preload joins | The existing JSON expressions reference the original query aliases. Remap or attach them after the candidate phase before enabling this shape. Hints without preload joins, including an empty join list, can merge. |
| Raw conditions that still need the exact-match phase | The raw SQL API does not identify deterministic expressions. Re-evaluating a volatile expression can change which calls match. Shared root-AND raw conditions already stay solely in the candidate phase. |
| Existing CTEs, GROUP BY, or row-multiplying root joins | The current builder assumes one candidate per entity and owns the `_find` / `_cand` / `_matched` CTE names. Broader support needs CTE composition, aggregate semantics, and row deduplication. |
| Scalar-only finds without a collection predicate | An implementation limit. Scalar comparisons could use the same candidate fence, but there is no repeated child lookup to eliminate. Varying parent/to-one values with a shared collection predicate are supported. |
| Explicit limit/offset | Uses the separate paginated loader. A limit on the batch union does not implement a limit for each caller. |

## Checking Plans with Application Data

Small integration fixtures verify result semantics and SQL structure, but cannot establish production performance. Before upgrading a workload with expensive collection finds:

1. Capture the generated SQL **and bindings** for representative concurrent calls on both versions, plus sequential calls using fresh EntityManagers to avoid loader caching.
2. Compare each entry's ordered entity IDs between batched and sequential execution on the same database snapshot.
3. Run `EXPLAIN (ANALYZE, BUFFERS)` with those bindings against a representative snapshot or read replica. Include small, typical, and large batches with realistic list overlap.
4. Check candidate phase time, buffer usage, and collection subplan loop counts. Compare `_cand` row counts with the number of rows surviving `_matched`: broad filters may materialize more rows than the exact-OR strategy. The tag subplan still runs per candidate, but reads scalar/record arrays from the candidate CTE. Also check temporary-file spills and memory use from the additional child records.

The materialization fence prevents outer grouping or ordering from shaping the candidate phase; it does not guarantee a particular index or execution time. Replaying planner statistics on empty tables is insufficient because PostgreSQL scales row estimates using actual table pages.
