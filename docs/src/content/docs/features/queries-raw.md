---
title: SQL Queries
description: Making Lower Level SQL Queries
sidebar:
  order: 3.2
---

Joist's primary query API is [em.find](./queries-find), which excels at **finding entities** and **preventing N+1s**.

However it's limited in what it supports: no group bys, aggregates, subqueries, or other lower-level SQL features.

When you need these capabilities, Joist provides `em.query` for creating arbitrary `SELECT` statements (and if you need low-level `INSERT`, `UPDATE`, and `DELETE` see [`em.execute`](/features/sql-mutations/)).

Here's an example of getting the count of books per author:

```ts
const [a, b] = tables(Author, Book);
const rows = await em.query({
  select: { name: a.firstName, bookCount: b.id.count() },
  from: a,
  join: [a.books.as(b)],
  where: a.age.gte(minAge),
  groupBy: [a.firstName],
  orderBy: { bookCount: "DESC" },
  limit: 10,
});
// rows is { name: string; bookCount: number }[]
```

We'll discuss more, but the biggest DX differentiator of `em.query` is that it's **not fluent builders**, i.e. the pervasive `.from("authors").join("books")` syntax common in other ORMs, that originated as a [pattern for languages](https://martinfowler.com/bliki/FluentInterface.html) from the 90s, like Java and C++.

Joist realizes that JavaScript and TypeScript excel at **creating data structures**, creating POJOs, and so the `em.query` API leans into the strengths of the languages we actually use today.

## When to use Find vs. Query

You should prefer `em.find` for the ~80-90% of queries in your codebase that are plain `SELECT`s to load entities.

`em.find`'s killer feature is that, because it specializes in "loading entites", it strictly controls the SQL it generates and **automatically batch every em.find** for bullet-proof N+1 prevention.

In contrast, `em.query` lets you craft whatever SQL query you want -- but then Joist is not able to rewrite those arbitrary queries into auto-batched / N+1 safe variants, so **every em.query is a real database call**.

This sounds alarmist, but "every query is a real database call" is very standard behavior for ORMs; it's only surprising in Joist, given our dedication to N+1 prevention.

## Starting with Tables

All `em.query`s start with declaring the tables you'll use, using the `table` or `tables` function:

```typescript
import { table, tables } from "joist-orm";

// A query with 1 table
const a = table(Author);
return em.query({ from: a, ... });

// A query with two tables
const [b, br] = tables(Book, BookReview);
return em.query({ from: b, join: [{ left: br, ... }]});
```

The `a`, `b`, and `br` variables are then statically typed to the columns of their respective tables, i.e.

- `a.firstName` is the author's `first_name` column,
- `b.authorId` is the book's `author_id` foreign key

We then use these fields (really SQL expressions pointing at the underlying columns) in the `select`, `join`, `where` keys to build out the rest of the SQL query.

Each table gets an alias, which defaults to its tag name, i.e. `select * from authors as a`, but you can customize the alias when adding the same table multiple times to a query:

```typescript
const author = table(Author);
const mentor = table(Author, "mentor");
```

A table is also used as every query's `from`, which starts the `FROM authors` that the rest of the query will build on:

```typescript
// A query with 1 table
const a = table(Author);
return em.query({ from: a, ... });
```

## Adding Joins

After the initial `from` table, we add can join in other tables via one of three ways:

- **Explicit joins** are the most direct way, and are an object literal with either the `inner` or `left` key set to the table we're joining in, and an `on` expression:

  ```ts
  const [a, b, bs] = tables(Author, Book, BookStats);
  em.query({
    from: a,
    join: [
      // Becomes JOIN books b ON b.author_id = a.id
      { inner: b, on: b.authorId.eq(a.id) },
      // Becomes LEFT JOIN book_stats bs ON bs.book_id = b.id
      { left: bs, on: bs.bookId.eq(b.id) },
    ];
  );
  ```

- **Relationship joins** are syntax sugar for quickly adding joins that "walk the graph" of relations.

  ```ts
  const [a, b, bs] = tables(Author, Book, BookStats);
  em.query({
    from: a,
    // These are the same joins as before
    join: [a.books.as(b), b.bookStats.as(bs)];
  );
  ```

  These joins leverage that Joist knows the entity relationships, so we don't have to type "the FK id equals the primary key id" over & over. 😅

  Relationship joins will automatically be `INNER` or `LEFT` as appropriate for the query, i.e.:

  - joining `a.books.as(b)` will create a `LEFT JOIN` for `books` so that an author without any books is not dropped from the query (i.e. its a potentially empty collection),
  - joining `b.author.as(a)` will create an `INNER JOIN` for `author` b/c we know the `author_id` is required (i.e. it's a required reference)
    - But if `b` itself was already left joined into the query, then `b.author.as(a)` will flip and "percolate the optionality"
  - joining `a.publisher.as(p)` will create an `LEFT JOIN` for `puslierh` b/c we know the `publisher_id` is nullable (i.e. it's an optional reference)

- **Relationship trees** are an _even sugary_ way of declaring joins, where instead of a flat list of joins, we use an `em.find`-style tree of relationships:

  ```ts
  const [a, b] = tables(Author, Book);
  const rows = await em.query({
    from: a,
    // When join is a literal, it's "rooted" to the
    // same table as `from`, so we "start at author"
    join: {
      // We can inline simple conditions, as em.find
      firstName: "Alice",
      // And recursive into relations that become joins
      books: { as: b, title: { ilike: "%database%" } },
    },
    select: { author: a.firstName, title: b.title },
  });
  ```

In general, Relationship Trees are the easiest way of declaring joins, but you can progressively fallback on Relationship Joins and Explicit Joins as/if you need more control over the query.

:::tip[Tip]

Joining a collection fans rows out — one row per book, not per author. To _filter_ by a collection without causing duplication of the original row, use a subquery instead:

```typescript
em.query({
  from: a,
  where: a.id.in(query({
    from: b,
    select: b.author_id
  }))
});
```

:::


## Selecting Values

The `select` key determines the data we return over the wire,
and the resulting `rows` return type, and has three main forms;

- **A POJO literal** that defines each row's column name & value:

  ```ts
  const a = table(Author);
  const rows = await em.query({
    // Declare fieldName -> value
    select: { id: a.id, name: a.firstName, age: a.age },
    from: a,
  });
  // { id: AuthorId; name: string; age: number | undefined }[]
  ```

  This is the most standard "get back rows with column names & values" behavior.

  Return values are decoded just like in entities: ids as tagged ids (`"a:1"`), enums as enums, and columns like `timestamptz` go through their serdes to become `ZonedDateTime` or other respective domain values.

  The return types will be optional (i.e. `age: number | undefined`) based on both the column type itself (i.e. if `age` is nullable in the database) _or_ if the table was left-joined into the query.

- **A table** reference which loads that table's rows as entities:

  ```ts
  const a = table(Author);
  const authors = await em.query({
    // Returns an Author entity
    select: a,
    from: a,
    join: [{ inner: b, on: b.author_id.eq(a.id) }],
    groupBy: [a.id],
    orderBy: [{ sort: b.id.count(), order: "DESC" }],
  });
  ```

  The entities will be loaded through the `EntityManager`'s identity map, just like `em.find`, so you'll get the same requested-cached instance with any WIP edits.

  This "entity mode" of `em.query` makes it look like `em.find`, but a) gives you low-level control over the whole SQL statement, and b) again meaning it won't be auto-batched.

   Similar to `em.find`, you can pass `populate` to get back preloaded entities.

  ```ts
  const authors = await em.query(
    { from: a, select: a, where: a.age.gte(18) },
    { populate: { books: "reviews" },
  });
  // Loaded<Author, { books: "reviews" }>[]
  const reviews = authors[0].books.get[0].reviews.get;
  ```

- **A single expression** returns an array of that expression's values:

  ```ts
  // Returns an AuthorId[] without any wrapping rows
  const authorIds = await em.query({ from: a, select: a.id });
  // AuthorId[]
  ```

  We call this a "scalar result" because it returns the scalar/primitive value directly, instead of being wrapped in a row.

  Behind the scenes, this becomes `SELECT a.id AS value`, and `em.query` just promotes each `row.value` into the return value as a single array, as an ergonomic affordance.

## Filtering Where

`where` values are created primarily using the same table variables and turning their columns into boolean conditions, like `eq`: 

```ts
const a = table(Author);
const rows = await em.query({
  select: { id: a.id, name: a.firstName, age: a.age },
  from: a,
  where: a.firstName.eq("Bob"),
});
```

Columns become conditions by using a comparison method, like `eq` or `ne`, as well as common SQL functions:

- Comparisons like `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `like`, `ilike`.
  - These accept both values like `.eq("Bob")` and other columns like `m.age.gt(a.age)`
- Count functions `count()`, `countDistinct()`
  - I.e. `a.id.count()` is the idiomatic `count(*)`
- Math functions lie `sum()`, `avg()`, `min()`, `max()`
- Aggregate functions like `arrayAgg()`, `stringAgg(delimiter)`
  - `arrayAgg` also accepts `distinct`, `orderBy`, and `filter`, i.e. `b.title.arrayAgg({ distinct: true })`
- `coalesce(fallback)`
- Other functions like `b.authorId.taggedId()` which return `"a:1"` values for use in SQL expression, like `arrayAgg`

Just like `em.find`, the `where` and `having` keys take the same `{ and: [...] }` / `{ or: [...] }` expressions for creating nested/complex conditions.

```ts
const rows = await em.query({
  from: a,
  join: [{ inner: b, on: b.author_id.eq(a.id) }],
  groupBy: [a.firstName],
  having: { and: [b.id.count().gt(1)] },
  select: { name: a.firstName, bookCount: b.id.count() },
});
```

Use `{ exists: query(...) }` to select Authors with at least one matching Book, without joining Books into the outer result or duplicating Authors:

```ts
const [a, b] = tables(Author, Book);
const authors = await em.query({
  from: a,
  where: {
    and: [a.age.gte(18), { exists: query({ from: b, where: b.author_id.eq(a.id), select: b.id }) }],
  },
  select: a,
});
```

Use `notExists` instead to select Authors without matching Books. See [EXISTS and NOT EXISTS](#exists-and-not-exists) for supported query shapes and subquery semantics.

A POJO `select` is also type-checked against the query's scope: selecting a column from a source that is neither `from` nor in `join` is a compile error that names the missing source. (Conditions in `where`/`having`/`orderBy` are not scope-checked at compile time; an out-of-scope source there fails at runtime.)


### Find Style Filters

One of `em.find`'s DX wins for filters is that, if incoming API `filter` shapes matched your domain 1:1, you can drop those key/values into `em.find` without manual translation:

```ts
type GetAuthorFilters = {
  firstName?: string;
  lastName?: string;
};

function getAuthors(filters: GetAuthorFilters) {
  return em.find(Author, { ...filters });
}
```

`em.query` supports the same pattern using `Table.where`:

```ts
const [a, b] = tables(Author, Book);
// I.e. passed as endpoint query parameters
const filter = {
  firstName: { ilike: "ali%" },
  age: { gte: 18 },
  bookTitle: "Favorite Title",
};
// Split out the filters per-table
const { bookTitle, ...authorOthers } = filter;
const rows = await em.query({
  from: a,
  join: [a.books.inner(b)],
  where: [a.where(authorOthers), b.where({ bookTitle }),
  select: a.firstName,
});
```

## Arbitrary Expressions

So far we've used table fields like `a.firstName` and `b.authorId` as the expressions in our `em.query` queries, but complicated SQL queries often need arbitrary SQL expressions.

For these, Joist has two mechanisms:

- **Expression literals** are object literals for common SQL functions that can be used anywhere the requires an expression.

  - `{ coalesce: [a.firstName, a.lastName] }`
  - `{ greatest: [a1.age, a2.age] }`  and `least`
    - Or combined `{ least: [{ greatest: [a.age, 18] }, 65] })`
  - Case statements
    ```ts
     { case: [
        { when: a.age.gte(18), then: "Adult" },
        { when: { and: [a.age.gte(13), a.age.lte(18)], then: "Teenager" },
        { else: "Child" }
      ] },
    ```
  - Array aggregation `{ arrayAgg: b.title }`
  - `{ nullIf: [a.lastName, ""] }`

- **`sql` Tagged Literals** are SQL injection-safe strings of arbitrary SQL.

  Because we need to know their type, they are created via shortcuts like `sql.number`, `sql.stringOrNull`, or `sql.stringArray`.

  ```typescript
  // A computed expression, usable in select/orderBy
  em.query({ from: b, select: sql.number`${b.order} * 2` });

  // Using an unmodeled column `ts_search` for full-text search
  em.query({
    from: a,
    where: sql.condition`${a.column("ts_search")} @@ plainto_tsquery(${words})`
  });

  // Other examples of misc/arbitrary syntax
  sql.boolean`CASE WHEN ${b.order.in([1, 2])} THEN true ELSE false END`;
  sql.number`row_number() OVER (PARTITION BY ${b.author_id} ORDER BY ${b.title})::int`;
  sql.number`count(*) FILTER (WHERE ${br.rating.gte(4)})::int`;
  ```

  If you already have a column like `a.firstName`, and just want to use it in a custom condition, you can use `.is` _as a tagged literal_ as a shorthand for a `sql.condition`:

  ```ts
  a.firstName.is`ILIKE ${pattern}`;
  a.age.is`BETWEEN ${min} AND ${max}`;
  ts.column("range").is`@> ${asOf}::timestamptz`;
  // Despite the name, `.is` doesn't inject the `IS` keyword
  a.age.is`IS NULL`
  ```

For the expression literals, you can use the `expr` function to declare an expression and then reuse it later:

```ts
import { expr } from "joist-orm";

// Create up-front to easily reuse
const someName = expr({
  coalesce: [a.lastName, a.firstName]
});

const rows = await em.query({
  from: a,
  select: { name: someName },
});
```

## Condition & Join Pruning

`em.query` prunes unnecessary clauses exactly like [find queries](./queries-find#condition--join-pruning): a condition that evaluates at runtime to `undefined` is dropped out, and a join that is never referenced by any remaining clauses is also dropped as well.

```ts
const { name, title } = req.filter; // either may be undefined
const rows = await em.query({
  from: a,
  join: [{ inner: b, on: b.authorId.eq(a.id) }],
  // Just use the filters as-is, no conditional spreads
  where: { and: [a.firstName.eq(name), b.title.eq(title)] },
  select: { name: a.firstName },
});
```

If `title` is `undefined`, its condition is dropped, nothing references `b` anymore, and so the join to `books` disappears too.

No need for a boilerplate `join: [...(title ? [join] : [])]` conditional spread when building the `join` clause.

Similarly, if you want conditional subqueries, i.e. conditional `in` clauses, you can use `queryMaybe` which will intelligently self-prune itself if all of it's `where` clauses are unused:

```ts
const [a, b] = tables(Author, Book);
const { bookTitle } = req.filter; // string | undefined
const authors = await em.query({
  select: a,
  from: a,
  where: a.id.in(
    queryMaybe({
      select: b.authorId,
      from: b,
      where: b.title.eq(bookTitle),
    }),
  ),
});
```

If `bookTitle` is `undefined`, `queryMaybe` will realize "it has nothing to query on", so return `undefined`, which means `a.id.in(undefined)` will also be pruned.

If you need to disable pruning, you can:

* Pass `keep: true` to each individual `{ inner: ... }` join, or
* Pass `pruneJoins: false` to `em.query`

## Soft Deletes

`em.query` hides soft-deleted rows the same way `em.find` does: a soft-deletable entity in `from` gains a `deleted_at IS NULL` condition in the `WHERE`, and a _collection_ sugar join (o2m/m2m, unless the relation is configured `softDeletes: "include"`) gains it in its join's `ON` — so a `LEFT` join nulls out a soft-deleted match instead of dropping the row.

_Reference_ sugar joins (m2o/o2o/poly) and explicit joins are **not** filtered, matching `em.find`'s relation semantics: `book.author.get` resolves a soft-deleted author, so joining through one should not drop the book. If you do want this behavior, you can add a `deleted_at` condition to the `on` manually.

You can opt out of soft-delete filtering with `softDeletes: "include"`:

```ts
const rows = await em.query({ from: a, select: { name: a.firstName }, softDeletes: "include" });
```

## Ordering and Paging

For ordinary queries, `orderBy` accepts an array of keyed or expression entries, or a single keyed object:

The **keyed form** uses keys from the POJO `select` (or physical column keys in entity mode), each with `"ASC"` or `"DESC"`, optionally suffixed with `NULLS FIRST` / `NULLS LAST`. I.e. `select: a` uses `orderBy: { firstName: "ASC" }`, while `select: { firstName: a.firstName }` uses `orderBy: { firstName: "ASC" }`:

```ts
const rows = await em.query({
  from: a,
  join: [{ inner: b, on: b.authorId.eq(a.id) }],
  groupBy: [a.firstName],
  select: { name: a.firstName, bookCount: b.id.count() },
  orderBy: [{ bookCount: "DESC" }, { name: "ASC NULLS LAST" }],
});
// ... ORDER BY "bookCount" DESC, name ASC NULLS LAST
```

Entries are applied in array order. A single keyed object is shorthand, i.e. `orderBy: { bookCount: "DESC", name: "ASC NULLS LAST" }` produces the same ordering.

The **expression form** takes arbitrary expressions — a column, an aggregate, or a `sql` template — including fields you didn't select. Each entry has a `sort` expression, an `order: "ASC" | "DESC" | undefined`, and an optional `nulls: "first" | "last"`:

```ts
orderBy: [
  { sort: b.id.count(), order: "DESC" },
  { sort: a.firstName, order: "ASC", nulls: "last" },
];
```

Keyed and expression entries can also be mixed:

```ts
orderBy: [{ bookCount: "DESC" }, { sort: a.firstName, order: "ASC", nulls: "last" }];
```

Both forms allow `undefined` entries. A keyed direction of `undefined` prunes that key; an expression order of `undefined` prunes the complete entry before its expression references are collected, so it does not retain an otherwise-unused join. Prefer the keyed form whenever what you're ordering by is already in `select`. [Set operations](#set-operations) only support the keyed form at their root.

## Composition: `query()`

`query(pojo)` takes the _same_ object literal as `em.query` and turns it into a value instead of running it. That value is how queries compose:

### Derived tables

A POJO select gives a subquery with typed columns, usable in `from`, `join`, and every clause. `as` names it, both in the SQL and in error messages:

```ts
const bookStats = query({
  from: b,
  groupBy: [b.authorId],
  select: { authorId: b.authorId, bookCount: b.id.count() },
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

A single-expression `select` in an ordinary `query({ from, select: expr })` returns a `ScalarQuery<R>`, a branded `Expr<R | null, never>`, where `R` is the selected row type. In scalar-expression context, zero rows produces SQL `NULL` and more than one row is a database error. `.coalesce()` handles the zero-row case, not multiple rows. Scalar subqueries close over outer sources, so correlation just works:

```ts
const rows = await em.query({
  from: a,
  select: {
    name: a.firstName,
    bookCount: query({ from: b, where: { and: [b.authorId.eq(a.id)] }, select: b.id.count() }).coalesce(0),
  },
});
```

The same single-expression subquery works as an `in` target and can return many rows, without turning an empty result into one `NULL` row. This includes polymorphic references, where the subquery's select column picks the component, i.e. `c.parent.in(query({ from: a, select: a.id }))` filters on `parent_author_id`:

```ts
where: {
  and: [a.id.in(query({ from: b, select: b.authorId }))];
}
```

### EXISTS and NOT EXISTS

Use `{ exists: queryValue }` or `{ notExists: queryValue }` wherever a query condition is accepted,
including `where`, `having`, join `on`, and nested `and`/`or` groups:

```ts
const booksForAuthor = query({ from: b, where: b.authorId.eq(a.id), select: b.id });

const authors = await em.query({
  from: a,
  where: { and: [a.age.gte(18), { exists: booksForAuthor }] },
  select: a,
});

const authorsWithoutBooks = await em.query({
  from: a,
  where: { notExists: booksForAuthor },
  select: a,
});
```

The operand must be a `query(...)` value, not a query literal or an ordinary expression.
Scalar, entity, POJO, and compound queries are supported. Correlated references retain the outer
joins they use. The subquery keeps its projection, grouping, `having`, and pagination: for example,
an ungrouped `count()` returns a row even when its input is empty, so `EXISTS` is true in that case.
Existence queries do not hydrate their selected entities.

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

## CTEs: `with`

`with` adds `query(...)` values to a SQL `WITH` clause. It only _declares_ the CTE; to read one, put the same value in `from` or `join`, where it renders as the bare CTE name instead of an inlined `(SELECT ...)`:

```ts
const bookStats = query({
  from: b,
  groupBy: [b.authorId],
  select: { authorId: b.authorId, bookCount: b.id.count() },
  as: "book_stats",
});

const rows = await em.query({
  with: bookStats,
  from: a,
  join: [{ inner: bookStats, on: bookStats.authorId.eq(a.id) }],
  select: { name: a.firstName, bookCount: bookStats.bookCount },
});
```

```sql
WITH book_stats AS (
  SELECT b.author_id AS "authorId", count(b.id)::int AS "bookCount"
  FROM books AS b WHERE b.deleted_at IS NULL GROUP BY b.author_id
)
SELECT a.first_name AS name, book_stats."bookCount" AS "bookCount"
FROM authors AS a JOIN book_stats ON book_stats."authorId" = a.id
WHERE a.deleted_at IS NULL
```

Because the value is the same [derived table](#derived-tables) either way, moving a subquery into a CTE is a one-line change, and its columns keep their types.

`as` names the CTE; without it Joist generates one. `with` takes a single value or an array, and CTEs may read _earlier_ entries in that array:

```ts
const prolific = query({
  from: bookStats,
  where: bookStats.bookCount.gte(2),
  select: { authorId: bookStats.authorId },
});
const rows = await em.query({
  with: [bookStats, prolific],
  from: a,
  join: [{ inner: prolific, on: prolific.authorId.eq(a.id) }],
  select: { name: a.firstName, id: prolific.authorId },
});
```

An `undefined` entry drops out, and a CTE nothing reads anymore is pruned along with the join that read it, the same [pruning](#condition--join-pruning) joins get; `pruneJoins: false` keeps every CTE. A CTE also needs named columns, so entity-mode and scalar `query(...)` values are rejected, the same rule [set operands](#set-operations) follow.

One `query(...)` value carries one SQL alias, so reading the same CTE twice in one query is an error; give each use its own value.

### Recursive CTEs

`recursiveQuery(name, base, step)` declares a `WITH RECURSIVE` CTE. `base` is the non-recursive term, which seeds the rows and, as in PostgreSQL, supplies the CTE's columns; `step` receives the CTE itself, so it can join back to the rows found so far:

```ts
const tree = recursiveQuery(
  "tree",
  { from: a, where: a.mentor_id.eq(null), select: { id: a.id, name: a.firstName } },
  (self) => ({
    from: a,
    join: [{ inner: self, on: a.mentor_id.eq(self.id) }],
    select: { id: a.id, name: a.firstName },
  }),
);

const rows = await em.query({ with: tree, from: tree, select: tree });
```

```sql
WITH RECURSIVE tree AS (
  (SELECT a.id AS id, a.first_name AS name FROM authors AS a
   WHERE a.mentor_id IS NULL AND a.deleted_at IS NULL)
  UNION ALL
  (SELECT a1.id AS id, a1.first_name AS name FROM authors AS a1
   JOIN tree ON tree.id = a1.mentor_id WHERE a1.deleted_at IS NULL)
)
SELECT tree.id AS id, tree.name AS name FROM tree
```

Unlike `query()` the name is required, because the step term has to name it. One recursive entry makes the whole clause `WITH RECURSIVE`, PostgreSQL's rule, without making the other entries recursive.

The terms are combined with `UNION ALL`. Pass `{ union: "distinct" }` for `UNION`, which drops duplicate rows and so stops a cyclic graph from looping forever:

```ts
const chain = recursiveQuery("chain", base, step, { union: "distinct" });
```

## Set Operations

`em.query` supports native PostgreSQL set operations in one SQL statement. A compound query is a separate root shape, not an extra clause on a `{ from, select, ... }` query:

```ts
const [a, b] = tables(Author, Book);
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

| Key            | SQL             | Result                                                             |
| -------------- | --------------- | ------------------------------------------------------------------ |
| `union`        | `UNION`         | Distinct rows from either side                                     |
| `unionAll`     | `UNION ALL`     | All rows, adding duplicate counts                                  |
| `intersect`    | `INTERSECT`     | Distinct rows present on both sides                                |
| `intersectAll` | `INTERSECT ALL` | Shared rows, taking the minimum duplicate count                    |
| `except`       | `EXCEPT`        | Distinct left rows not present on the right                        |
| `exceptAll`    | `EXCEPT ALL`    | Left rows, subtracting right duplicate counts with a floor of zero |

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
const bookSelect = { id: b.authorId, name: b.title };
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

Each operand has its own source scope: siblings cannot reference one another's local tables or subqueries. When an ordinary scalar/`IN` subquery reads a compound, its branches can use legitimate enclosing correlations. A correlation in any branch, including a non-first branch, keeps the referenced outer join alive. Reused tables and query values resolve afresh for each execution. Derived-table compounds do not gain implicit `LATERAL` support.

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
  orderBy: [{ sort: sql<string>`lower(${names.name})`, order: "ASC" }],
});
```

### Scalar subqueries and entity membership

To use a compound in `IN` or a scalar expression, first build named POJO rows, then select one column through an ordinary `query({ from, select: expr })`. The compound itself is a derived table, not a scalar expression or an `IN` target.

Entity-mode operands, including `query({ from: a, select: a })` values, are also excluded from compounds. Ordinary entity reads still work: combine compatible IDs and filter an entity query with `id.in(...)`:

```ts
const ids = query({
  union: [
    { from: a, select: { id: a.id } },
    { from: b, select: { id: b.authorId } },
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
  orderBy: [{ sort: ids.id, order: "ASC" }],
  limit: 1,
}).coalesce("a:1");
// Expr<AuthorId, never>
```

The entity membership query does not preserve `ALL` duplicate counts or the compound's ordering. Polymorphic `IN` predicates, i.e. `c.parent.in(query({ from: ids, select: ids.id }))`, use the selected column's agreed ID target, so compatible Author PK/FK operands select the Author component regardless of operand order.

## Not (Yet) Supported

- Scalar and entity-mode set operands; use named POJO columns and an [outer scalar subquery or ID membership query](#scalar-subqueries-and-entity-membership) instead
- `DISTINCT ON` — emulate with a `row_number()` ranked subquery
- Returning entities from a joined (non-`from`) table

:::tip[Info]

Note that we put `select` in "a weird spot": after the `groupBy`, instead of first, where it always appears in SQL.

This is because we're ordering the object keys in [SQL evaluation order](https://jvns.ca/blog/2019/10/03/sql-queries-don-t-start-with-select/).

This is solely a preference for potentially easier reasoning of the query--the order of the `from`, `join`, etc. keys does not actually affect runtime behavior, so you're free to use whatever key order you like.

:::
