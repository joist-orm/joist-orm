---
title: Raw Queries
description: Documentation for Raw Queries
sidebar:
  order: 3.2
---

Raw queries are Joist's API for low-level `SELECT`s: group bys, aggregates, subqueries, set operations, and arbitrary joins, returning entities, plain, strongly-typed POJOs, or scalar values.

Like [find queries](./queries-find), the `em.query` DSL is "just a POJO" of data--no fluent builders to chain 🎉, but thanks to TypeScript's mapped types, still sufficiently type-safe to catch most common errors/typos 💪.

Here's an example of getting the count of books per author:

```ts
const [a, b] = aliases(Author, Book);

const rows = await em.query({
  from: a,
  join: [{ left: b, on: b.author.eq(a.id) }],
  where: { and: [a.age.gte(minAge)] },
  groupBy: [a.firstName],
  select: { name: a.firstName, bookCount: b.id.count() },
  orderBy: { bookCount: "DESC" },
  limit: 10,
});
// rows is { name: string; bookCount: number }[]
```

:::tip[Info]

Note that we put `select` in "a weird spot": after the `groupBy`, instead of first, where it always appears in SQL.

This is because we're ordering the object keys in [SQL evaluation order](https://jvns.ca/blog/2019/10/03/sql-queries-don-t-start-with-select/).

This is solely a preference for potentially easier reasoning of the query--the order of the `from`, `join`, etc. keys does not actually affect runtime behavior, so you're free to use whatever key order you like.

:::

:::tip[Info]

Prefer [find queries](./queries-find) for the ~80-90% of queries that are plain entity `SELECT`s — they have join literals, batching, and preloading. `em.query` is the next level down, for the queries `em.find` can't express.

**Unlike `em.find`, `em.query` is not batched: each call executes one SQL statement.**

:::

## Selecting

The `select` key determines the `rows` return type:

- **A POJO literal** returns typed rows, one key per column. Values decode exactly like entity fields: ids come back as tagged ids (`"a:1"`), enums as enum values, custom serdes as their domain values.

  ```ts
  const rows = await em.query({ from: a, select: { id: a.id, name: a.firstName, age: a.age } });
  // { id: AuthorId; name: string; age: number | null }[]
  ```

- **An alias** returns that alias's entities, loaded through the `EntityManager`'s identity map like `em.find` — but the query itself can use group bys and aggregates:

  ```ts
  const authors = await em.query({
    from: a,
    join: [{ inner: b, on: b.author.eq(a.id) }],
    groupBy: [a.id],
    select: a,
    orderBy: [{ desc: b.id.count() }],
  });
  ```

  (Currently entities can only be selected using the same alias as the `from` key, not from a joined alias.)

- **A subquery** (see [Composition](#composition-query)) selects all of its columns, i.e. `select: bookStats` is that subquery's `SELECT *`. Like entity mode, the selected subquery must be the `from`, not a joined source; select a joined subquery's columns individually.

- **A single expression** in an ordinary `em.query({ from, select: expr })` returns an array of selected values, without the extra `null` from scalar-subquery context:

  ```ts
  const authorIds = await em.query({ from: a, select: a.id });
  // AuthorId[]
  ```

### Left joins and `null`

Row types follow the join list: a column from an inner-joined or `from` source keeps its type, and a column from a left-joined source picks up `| null`, because the join may not match.

The `.coalesce(fallback)` method creates a `COALESCE` with the default value, and so drops the `| null` type:

```ts
const rows = await em.query({
  from: a,
  join: [{ left: b, on: b.author.eq(a.id) }],
  select: { name: a.firstName, title: b.title, safeTitle: b.title.coalesce("No book") },
});
// { name: string; title: string | null; safeTitle: string }[]
```

## Conditions and Expressions

Alias columns (i.e. `a.firstName`) are typed expressions that can be used either to `select` the column directly, or use the column in a `where` condition (or other expression location).

For use in `where` clauses, alias columns keep all of the condition methods from `em.find`'s [complex conditions](./queries-find#complex-conditions) — `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `like`, `ilike` — and can compare across columns, i.e. `b.author.eq(a.id)` or `m.age.gt(a.age)`.

They also have common SQL functions as methods, such as aggregates:

- `count()`, `countDistinct()` — `b.id.count()` is the idiomatic `count(*)`
- `sum()`, `avg()` (numeric columns only), `min()`, `max()`
- `arrayAgg()`, `stringAgg(delimiter)` — like `min`/`max`, nullable (zero rows aggregate as `NULL`), and `arrayAgg` keeps element `NULL`s, i.e. a left-joined empty group is `[null]`
- `coalesce(fallback)`

The `where` and `having` keys take the same `{ and: [...] }` / `{ or: [...] }` expressions as `em.find`'s complex conditions — or a single bare condition, i.e. `where: a.age.gte(minAge)` — and `having` sees aggregates:

```ts
const rows = await em.query({
  from: a,
  join: [{ inner: b, on: b.author.eq(a.id) }],
  groupBy: [a.firstName],
  having: { and: [b.id.count().gt(1)] },
  select: { name: a.firstName, bookCount: b.id.count() },
});
```

A POJO `select` is also type-checked against the query's scope: selecting a column from an alias that is neither `from` nor in `join` is a compile error that names the missing alias. (Conditions in `where`/`having`/`orderBy` are not scope-checked at compile time; an out-of-scope alias there fails at runtime, with the same message.)


## Joins

### Explicit joins

Joins are expressed as an object literal of:

* Either `inner` or `left` key set to the alias (table) to join
* An `on` key describing the expression to join on

Examples are:

```ts
join: [
  { inner: b, on: b.author.eq(a.id) },
  { left: bookStats, on: bookStats.authorId.eq(a.id) },
  { left: c, on: { and: [c.parent.eq(a.id), c.text.ne(null)] } },
]
```

### Relationship joins

Given that adding joins for relationship traversal (i.e. `JOIN books b ON b.author_id = a.id` for the `books` relation) is very common, Joist provides syntax sugar for easily creating them.

Each relation is available as a key on the entity's alias, i.e. an `Author` alias `a` has `a.books`, which then has an `as` method to create the `{ left: b, on: b.author.eq(a.id) }` join literal.

```ts
const [a, b, p, t] = aliases(Author, Book, Publisher, Tag);

join: [
  a.books.as(b),      // LEFT JOIN books b ON b.author_id = a.id (a collection may be empty)
  a.publisher.as(p),  // LEFT JOIN publishers p ON a.publisher_id = p.id (nullable reference)
  b.author.as(a),     // JOIN authors a ON b.author_id = a.id (required reference: INNER)
  a.tags.as(t),       // m2m: joins authors_to_tags and tags; the pair prunes together
]
```

Whether `as` returns an `INNER` join or `LEFT` join follows the relation's nullability:

- a required reference (i.e. `book.author`, a required m2o) is `INNER`,
- a nullable reference, every collection (i.e. `author.books`), and one-to-ones are `LEFT`.

The argument to `as` is type-checked against the relation's known type, i.e. `a.books.as(p)` (which is passing an incorrect `Publisher` alias to the `books` relation) is a compile error.

Self-joins (joining back into an existing table) are supported with named aliases, i.e. `alias(Author, "m")`:

```ts
const [a] = aliases(Author);
const m = alias(Author, "m");
const rows = await em.query({
  from: a,
  join: [a.mentor.inner(m)],
  where: { and: [m.age.gt(a.age)] },
  select: { mentee: a.firstName, mentor: m.firstName },
});
```

Polymorphic references pick their component from the argument, i.e. `c.parent.as(a)` joins through `parent_author_id`, like an explicit join with `on: c.parent.eq(a.id)`.

:::tip[Tip]

Joining a collection fans rows out — one row per book, not per author. To *filter* by a collection without duplicates, use a subquery instead: `a.id.in(query({ from: b, select: b.author }))`.

:::


## Condition & Join Pruning

`em.query` prunes exactly like [find queries](./queries-find#condition--join-pruning): a condition given `undefined` drops out, and a join that nothing references anymore drops with it.

```ts
const { nameFilter, titleFilter } = req.filter; // either may be undefined
const rows = await em.query({
  from: a,
  join: [{ inner: b, on: b.author.eq(a.id) }],
  where: { and: [a.firstName.eq(nameFilter), b.title.eq(titleFilter)] },
  select: { name: a.firstName },
});
```

If `titleFilter` is `undefined`, its condition disappears, nothing references `b` anymore, and the join to `books` disappears too — no `...(titleFilter ? [join] : [])` conditional spreads needed.

Two things to know:

- An **inner join filters rows by itself**, so pruning an unreferenced inner join also drops that filter. If the join _is_ the filter (an existence check), pin it with `keep: true`, or better, write it as `a.id.in(query({ from: b, select: b.author }))`, which never prunes.
- A join that is still referenced but whose `on` condition pruned away entirely is a **runtime error**, not a cross join.

`pruneJoins: false` on the query turns join pruning off, and `undefined` entries in the `join` and `orderBy` arrays are allowed so conditional spreads still work.

## Soft Deletes

`em.query` hides soft-deleted rows the same way `em.find` does: a soft-deletable entity in `from` gains a `deleted_at IS NULL` condition in the `WHERE`, and a *collection* sugar join (o2m/m2m, unless the relation is configured `softDeletes: "include"`) gains it in its join's `ON` — so a `LEFT` join nulls out a soft-deleted match instead of dropping the row.

*Reference* sugar joins (m2o/o2o/poly) and explicit joins are **not** filtered, matching `em.find`'s relation semantics: `book.author.get` resolves a soft-deleted author, so joining through one should not drop the book. If you do want this behavior, you can add a `deletedAt` condition to the `on` manually.

You can opt out of soft-delete filtering with `softDeletes: "include"`:

```ts
const rows = await em.query({ from: a, select: { name: a.firstName }, softDeletes: "include" });
```

Like `em.find`, filtering is skipped for CTI subtypes.

## Ordering and Paging

For ordinary queries, `orderBy` accepts an array of keyed or expression entries, or a single keyed object:

The **keyed form** mirrors `em.find`: the keys are any existing keys from the `select` (or the entity's fields in entity mode), each with `"ASC"` or `"DESC"`, optionally suffixed with `NULLS FIRST` / `NULLS LAST`:

```ts
const rows = await em.query({
  from: a,
  join: [{ inner: b, on: b.author.eq(a.id) }],
  groupBy: [a.firstName],
  select: { name: a.firstName, bookCount: b.id.count() },
  orderBy: [{ bookCount: "DESC" }, { name: "ASC NULLS LAST" }],
});
// ... ORDER BY "bookCount" DESC, name ASC NULLS LAST
```

Entries are applied in array order. A single keyed object is shorthand, i.e. `orderBy: { bookCount: "DESC", name: "ASC NULLS LAST" }` produces the same ordering.

The **expression form** takes arbitrary expressions — a column, an aggregate, or a `sql` template — including fields you didn't select, with `{ asc: expr }` / `{ desc: expr }` entries and an optional `nulls: "first" | "last"`:

```ts
orderBy: [{ desc: b.id.count() }, { asc: a.firstName, nulls: "last" }]
```

Keyed and expression entries can also be mixed:

```ts
orderBy: [{ bookCount: "DESC" }, { asc: a.firstName, nulls: "last" }]
```

Both forms allow `undefined` (entries or directions) so conditional spreads work. Prefer the keyed form whenever what you're ordering by is already in `select`. [Set operations](#set-operations) only support the keyed form at their root.

## Composition: `query()`

`query(pojo)` takes the _same_ object literal as `em.query` and turns it into a value instead of running it. That value is how queries compose:

### Derived tables

A POJO select gives a subquery with typed columns, usable in `from`, `join`, and every clause. `as` names it, both in the SQL and in error messages:

```ts
const bookStats = query({
  from: b,
  groupBy: [b.author],
  select: { authorId: b.author, bookCount: b.id.count() },
  as: "book_stats",
});

const rows = await em.query({
  from: a,
  join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
  select: { name: a.firstName, bookCount: bookStats.bookCount.coalesce(0) },
});
```

Subqueries chain — `query({ from: bookStats, ... })` — and `select: bookStats` on its own is `SELECT *`.

### Scalar and list subqueries

A single-expression `select` in an ordinary `query({ from, select: expr })` returns an `Expr<R | null, never>`, where `R` is the selected row type. In scalar-expression context, zero rows produces SQL `NULL` and more than one row is a database error. `.coalesce()` handles the zero-row case, not multiple rows. Scalar subqueries close over outer aliases, so correlation just works:

```ts
const rows = await em.query({
  from: a,
  select: {
    name: a.firstName,
    bookCount: query({ from: b, where: { and: [b.author.eq(a.id)] }, select: b.id.count() }).coalesce(0),
  },
});
```

The same single-expression subquery works as an `in` target and can return many rows, without turning an empty result into one `NULL` row. This includes polymorphic references, where the subquery's select column picks the component, i.e. `c.parent.in(query({ from: a, select: a.id }))` filters on `parent_author_id`:

```ts
where: {
  and: [a.id.in(query({ from: b, select: b.author }))]
}
```

### Reusing a base query

Because queries are data, sharing a base is just a spread — i.e. a page of rows plus a total count from one definition:

```ts
const base = { from: a, where: { and: [a.firstName.like(filter)] } } satisfies Omit<Query, "select">;
const page = await em.query({ ...base, select: { name: a.firstName }, orderBy: { name: "ASC" }, limit: 20 });
const [{ total }] = await em.query({ ...base, select: { total: a.id.count() } });
```

:::tip[Tip]

Standalone query objects should use `satisfies Query`, not a `: Query` annotation — the annotation widens `select` and loses the per-column types. Joist detects this and reports "select was typed too generically; use `satisfies Query` instead of `: Query`".

:::

## Set Operations

`em.query` supports native PostgreSQL set operations in one SQL statement. A compound query is a separate root shape, not an extra clause on a `{ from, select, ... }` query:

```ts
const [a, b] = aliases(Author, Book);
const authorNames = { from: a, select: { name: a.firstName } } satisfies Query;
const bookNames = { from: b, select: { name: b.title } } satisfies Query;

const rows = await em.query({
  union: [authorNames, bookNames],
  orderBy: { name: "ASC" },
  limit: 50,
});
// { name: string }[]
```

Exactly one operation key is allowed per compound:

| Key | SQL | Result |
| --- | --- | --- |
| `union` | `UNION` | Distinct rows from either side |
| `unionAll` | `UNION ALL` | All rows, adding duplicate counts |
| `intersect` | `INTERSECT` | Distinct rows present on both sides |
| `intersectAll` | `INTERSECT ALL` | Shared rows, taking the minimum duplicate count |
| `except` | `EXCEPT` | Distinct left rows not present on the right |
| `exceptAll` | `EXCEPT ALL` | Left rows, subtracting right duplicate counts with a floor of zero |

Equality compares complete projected SQL rows, before JavaScript decoding, and treats corresponding SQL `NULL`s as equal. Two different SQL rows can still decode to equal JavaScript values, i.e. if a JSON schema strips fields; that does not make them duplicates in SQL.

Operands can be ordinary read-query POJOs, nested compound POJOs, or compatible `Subquery` values created by `query()`. Every operand and every compound result must have named POJO columns, even for a single column. Scalar-select operands are rejected at compile time and runtime: all-scalar compounds, mixed scalar/POJO operands, reusable scalar `query()` values, and scalar operands inside nested compounds are unsupported. Arbitrary expressions are not set operands either.

Each operation requires **at least two operands**. Known tuples are checked at compile time; every input is checked at runtime, including dynamic arrays. Readonly tuples and arrays are supported. Unlike optional conditions, `undefined`, `null`, and `false` operands are rejected, not omitted: removing the first operand of `EXCEPT` would change its meaning.

For standalone compound objects, use `satisfies SetQuery` instead of a `: SetQuery` annotation to retain literal row types, just as with `satisfies Query` for ordinary queries. Collections widened to the general operand type lose their known output keys and are rejected at compile time:

```ts
const combined = { union: [authorNames, bookNames] as const } satisfies SetQuery;
await em.query(combined);
```

### Named columns and result types

Every POJO operand must have exactly the same keys. The first operand determines output names and column order, and Joist aligns later operands by key, not their object insertion order. For example, these projections are compatible:

```ts
const authorSelect = { name: a.firstName, id: a.id };
const bookSelect = { id: b.author, name: b.title };
```

Joist uses projection wrappers to reorder output columns without mutating caller-owned objects or query values. Branch `distinct`, ordering, and pagination stay in place, and selected expressions are not repeated merely to reorder them. Missing or extra keys are rejected, including at runtime for untyped inputs.

`union` and `unionAll` combine each column's compatible value types and nullability from every operand, including left-join nullability. I.e. a required `name: string` combined with a left-joined `name: string | null` returns `{ name: string | null }[]`, regardless of operand order. `intersect`, `except`, and their `All` variants conservatively retain the left row type; they do not infer narrower nullability.

### Grouping, scope, and paging

Each object owns its clauses. A compound root accepts `orderBy`, `limit`, and `offset`, plus `as` when constructing a named `query()` value. It does not accept `from`, `select`, `join`, `where`, `groupBy`, `having`, `distinct`, `softDeletes`, or `pruneJoins`; put these in an operand or an ordinary outer query.

```ts
const rows = await em.query({
  unionAll: [
    { ...authorNames, orderBy: { name: "ASC" }, limit: 10 },
    { ...bookNames, orderBy: { name: "ASC" }, limit: 10, offset: 10 },
  ],
  orderBy: { name: "DESC" },
  limit: 5,
  offset: 2,
});
```

Here each branch contributes its own page; the root orders and pages the combined rows. Branch ordering alone does not promise final output order.

Operand arrays associate **left-to-right**. Joist emits explicit SQL parentheses for operands and the accumulated left side, preserving nested grouping rather than relying on PostgreSQL's higher precedence for `INTERSECT`. For compatible read operands `q1`, `q2`, and `q3`:

```ts
query({ except: [q1, q2, q3] });
// (q1 EXCEPT q2) EXCEPT q3

query({ except: [q1, { except: [q2, q3] }] });
// q1 EXCEPT (q2 EXCEPT q3), not the same as the previous query

query({ intersect: [{ union: [q1, q2] }, q3] });
// (q1 UNION q2) INTERSECT q3
```

Each operand has its own alias scope: siblings cannot reference one another's local aliases. When an ordinary scalar/`IN` subquery reads a compound, its branches can use legitimate enclosing correlations. A correlation in any branch, including a non-first branch, keeps the referenced outer join alive. Reused aliases and query values resolve afresh for each execution. Derived-table compounds do not gain implicit `LATERAL` support.

Each branch retains its own soft-delete, STI filtering, and join-pruning behavior; there are no compound-wide policy overrides.

Root `orderBy` accepts **output-key directions only**, as a single object or an array of objects. Directions are `"ASC"` / `"DESC"`, optionally followed by `NULLS FIRST` / `NULLS LAST`; `undefined` entries and directions are pruned. Branch column references and arbitrary expression sorts are rejected at the root.

### Reusable compounds and outer expressions

`query()` turns every compound into a `Subquery` with typed, named columns. Use `as` to name it, execute it directly for POJO rows, or use it as another query's `from` or `join` source and reference its columns in projections or predicates. For expression ordering, use an ordinary outer query:

```ts
const names = query({
  union: [authorNames, bookNames],
  as: "names",
});

await em.query(names);
const rows = await em.query({
  from: names,
  where: names.name.ne(""),
  select: names,
  orderBy: [{ asc: sql<string>`lower(${names.name})` }],
});
```

### Scalar subqueries and entity membership

To use a compound in `IN` or a scalar expression, first build named POJO rows, then select one column through an ordinary `query({ from, select: expr })`. The compound itself is a derived table, not a scalar expression or an `IN` target.

Entity-mode operands, including `query({ from: a, select: a })` values, are also excluded from compounds. Ordinary entity reads still work: combine compatible IDs and filter an entity query with `id.in(...)`:

```ts
const ids = query({
  union: [
    { from: a, select: { id: a.id } },
    { from: b, select: { id: b.author } },
  ],
});
// Subquery<{ id: AuthorId }, "?">

const authors = await em.query({
  from: a,
  where: a.id.in(query({ from: ids, select: ids.id })),
  select: a,
});
// Author[]
```

The outer single-expression subquery can consume many compound rows in `IN`. Used as a scalar expression, it adds the zero-row `NULL` and errors on multiple rows, just like any ordinary scalar subquery. Apply `.coalesce()` to that outer expression, not to the compound. For example, select at most one ID before providing a fallback:

```ts
const firstAuthorId = query({
  from: ids,
  select: ids.id,
  orderBy: [{ asc: ids.id }],
  limit: 1,
}).coalesce("a:1");
// Expr<AuthorId, never>
```

The entity membership query does not preserve `ALL` duplicate counts or the compound's ordering. Polymorphic `IN` predicates, i.e. `c.parent.in(query({ from: ids, select: ids.id }))`, use the selected column's agreed ID target, so compatible Author PK/FK operands select the Author component regardless of operand order.

### Output compatibility and codecs

Compatibility is deliberately conservative: every output needs a known codec with the **same SQL representation, logical domain, and exact ID target**. Compatible TypeScript types or PostgreSQL's ability to find a common SQL type are not sufficient. These checks apply to all six operators, including `except` and `intersect` even though their result types retain the left row.

- `a.id` and `b.author` are compatible Author IDs, despite distinct expression/serde instances. Results decode as tagged Author IDs, and combined columns retain their encoders for comparisons such as `.eq("a:1")` and `.coalesce()` fallbacks.
- `a.id` and `b.id` are rejected: identical integer storage does not make Author IDs and Book IDs the same domain.
- `a.age` and `a.age.sum()` are rejected in either order: the field is `int4`, while its `SUM` is `int8`, even though both expose TypeScript numbers. Matching `SUM` outputs are supported and decode as numbers. Joist does not silently promote or coerce mismatched outputs.
- Aggregate compatibility also requires a known PostgreSQL overload. I.e. `MIN`/`MAX` of `varchar` or `name` produce `text`, so their outputs do not share the original field's SQL representation. Unmodeled aggregate overloads remain unsupported as set outputs.
- Known scalar enums (including native enums), custom types, schema-backed JSON, `Date`, and Temporal values are supported when their SQL representations and domains match. Domain compatibility uses the enum, custom mapper, JSON schema, or date/time conversion, not merely the storage type or the field's TypeScript shape. Different schemas, or a custom type and a primitive with identical storage, are not interchangeable.
- Physical primitive arrays and `arrayAgg()` outputs are supported only when both the driver array representation and element conversion are known. I.e. `a.nickNames` can combine with `a.firstName.arrayAgg()` when both are `varchar[]`, and `a.id.arrayAgg()` can combine with `b.author.arrayAgg()`. Element encoders and decoders are retained.
- Physical enum, custom-type, `Date`, and Temporal array columns are rejected, even when both operands select the same field. Native enum/citext arrays, `Date`/Temporal aggregates, primitive numeric arrays, and custom numeric aggregates also remain unsupported because array driver values may differ from scalar values. Nested SQL arrays, including `arrayAgg()` over an array, are unsupported.
- Outputs from `sql<R>` and `sql.ref` have unknown codecs and are rejected, even if both operands reuse the same expression or produce only SQL `NULL`. A generic annotation or a cast inside raw SQL does not declare a codec. Known nullable field outputs remain supported even when every returned value happens to be `NULL`.

These codecs are internal compatibility information, not a public coercion/decoder API. Raw `sql` expressions remain available in ordinary queries, including an outer query over a compatible compound; they do not bypass set-output validation.

## Escape Hatches: `sql`

For SQL that Joist does not model, the `sql` tagged template creates a typed expression, `sql.condition` creates a condition, and `sql.ref` reaches an unmodeled column:

```ts
// A computed expression, usable in select/orderBy
sql<number>`${b.order} * ${2}`;

// A condition, i.e. full-text search against an unmodeled column
where: {
  and: [sql.condition`${sql.ref(a, "ts_search")} @@ plainto_tsquery(${words})`]
}

// CASE expressions, window functions, FILTER, EXISTS...
sql<boolean>`CASE WHEN ${b.order.in([1, 2])} THEN true ELSE false END`;
sql<number>`row_number() OVER (PARTITION BY ${b.author} ORDER BY ${b.title})::int`;
sql<number>`count(*) FILTER (WHERE ${br.rating.gte(4)})::int`;
where: {
  and: [sql.condition`EXISTS ${query({ from: b, where: { and: [b.author.eq(a.id)] }, select: b.id })}`]
}
```

Interpolated expressions and conditions render with the alias Joist assigned and participate in join pruning; every other interpolated value becomes a query binding, never string concatenation.

## Not (Yet) Supported

- Scalar and entity-mode set operands; use named POJO columns and an [outer scalar subquery or ID membership query](#scalar-subqueries-and-entity-membership) instead
- `INSERT` / `UPDATE` / `DELETE` through `query()` or `em.query`; mutations are not read operands, even with `RETURNING`
- User-authored CTEs (`WITH ...`) — subqueries render as inline derived tables
- `DISTINCT ON` — emulate with a `row_number()` ranked subquery
- Returning entities from a joined (non-`from`) alias
