---
title: Raw Queries
description: Documentation for Raw Queries
sidebar:
  order: 3.2
---

Raw queries are Joist's API for low-level `SELECT`s: group bys, aggregates, subqueries, and arbitrary joins, returning either entities or plain, strongly-typed POJOs.

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

The `select` key decides the row type:

- **A POJO literal** returns typed rows, one key per column. Values decode exactly like entity fields: ids come back as tagged ids (`"a:1"`), enums as enum values, custom serdes as their domain values.

  ```ts
  const rows = await em.query({ from: a, select: { id: a.id, name: a.firstName, age: a.age } });
  // { id: AuthorId; name: string; age: number | null }[]
  ```

- **A bare alias** returns entities, loaded through the `EntityManager`'s identity map like `em.find` — but the query itself can use group bys and aggregates:

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

- **A subquery** (see [Composition](#composition-query)) selects all of its columns, i.e. `select: bookStats` is that subquery's `SELECT *`.

### Left joins and `null`

Row types follow the join list: a column from an inner-joined or `from` source keeps its type, and a column from a left-joined source picks up `| null`, because the join may not match. `.coalesce(fallback)` recovers the non-null type:

```ts
const rows = await em.query({
  from: a,
  join: [{ left: b, on: b.author.eq(a.id) }],
  select: { name: a.firstName, title: b.title, bookCount: b.id.count().coalesce(0) },
});
// { name: string; title: string | null; bookCount: number }[]
```

## Conditions and Expressions

Alias columns are typed expressions. They keep all of the condition methods from `em.find`'s [complex conditions](./queries-find#complex-conditions) — `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `like`, `ilike` — and can compare across columns, i.e. `b.author.eq(a.id)` or `m.age.gt(a.age)`.

They also carry SQL functions as methods, so aggregates need no imports:

- `count()`, `countDistinct()` — `b.id.count()` is the idiomatic `count(*)`
- `sum()`, `avg()` (numeric columns only), `min()`, `max()`
- `arrayAgg()`, `stringAgg(delimiter)`
- `coalesce(fallback)`

The `where` and `having` keys take the same `{ and: [...] }` / `{ or: [...] }` expressions as `em.find`'s complex conditions, and `having` sees aggregates:

```ts
const rows = await em.query({
  from: a,
  join: [{ inner: b, on: b.author.eq(a.id) }],
  groupBy: [a.firstName],
  having: { and: [b.id.count().gt(1)] },
  select: { name: a.firstName, bookCount: b.id.count() },
});
```

Conditions are also type-checked against the query's scope: selecting or comparing a column from an alias that is neither `from` nor in `join` is a compile error that names the missing alias.


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

Whether `as` returns an `INNER` join or `LEFT` follows the relation's nullability:

- a required reference (i.e. `book.author`, a required m2o) is `INNER`,
- a nullable reference and every collection (i.e. `author.books`) are `LEFT`.

The argument to `as` is type-checked against the relation's known type, i.e. `a.books.as(p)` (passing an incorrect `Publisher` alias to the `books` relation) is a compile error.

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

Polymorphic references pick their component from the argument, i.e. `c.parent.as(a)` joins through `parent_author_id`, which the expanded form cannot express.

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

## Ordering and Paging

`orderBy` has two forms; prefer the keyed form whenever what you're ordering by is already in `select`.

The **keyed form** mirrors `em.find`: the keys are keys of `select` (or the entity's fields in entity mode), each with `"ASC"` or `"DESC"`, optionally suffixed with `NULLS FIRST` / `NULLS LAST`. It renders as SQL output-column names, so ordering by an aggregate doesn't repeat the expression, and an `undefined` direction prunes the entry:

```ts
const rows = await em.query({
  from: a,
  join: [{ inner: b, on: b.author.eq(a.id) }],
  groupBy: [a.firstName],
  select: { name: a.firstName, bookCount: b.id.count() },
  orderBy: { bookCount: "DESC", name: "ASC NULLS LAST" },
});
// ... ORDER BY "bookCount" DESC, name ASC NULLS LAST
```

The **array form** takes arbitrary expressions — a column, an aggregate, or a `sql` template — for ordering by anything you didn't select, with `{ asc: expr }` / `{ desc: expr }` entries and an optional `nulls: "first" | "last"`:

```ts
orderBy: [{ desc: b.id.count() }, { asc: a.firstName, nulls: "last" }]
```

Both forms allow `undefined` (entries or directions) so conditional spreads work.

`limit`, `offset`, and `distinct: true` do what they say.

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

A single-expression `select` gives a scalar expression, `number | null` because a subquery can return no row (`.coalesce()` recovers). Scalar subqueries close over outer aliases, so correlation just works:

```ts
const rows = await em.query({
  from: a,
  select: {
    name: a.firstName,
    bookCount: query({ from: b, where: { and: [b.author.eq(a.id)] }, select: b.id.count() }).coalesce(0),
  },
});
```

And a single-column subquery works as an `in` target:

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

## Escape Hatches: `sql`

For SQL that Joist does not model, the `sql` tagged template creates a typed expression, `sql.condition` creates a condition, and `sql.ref` reaches an unmodeled column:

```ts
// A computed expression, usable in select/orderBy
sql<number>`${bli.amountInCents.sum()} - ${b.amountPaidInCents}`;

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

- `UNION` / `INTERSECT` / `EXCEPT` — run the queries separately and merge in memory
- User-authored CTEs (`WITH ...`) — subqueries render as inline derived tables
- `DISTINCT ON` — emulate with a `row_number()` ranked subquery
- Returning entities from a joined (non-`from`) alias
