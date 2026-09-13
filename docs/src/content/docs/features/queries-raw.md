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
    // When join is an object literal, it's "rooted" to the
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
    and: [
      a.age.gte(18),
      { exists: query({ from: b, where: b.authorId.eq(a.id), select: b.id }) },
    ],
  },
  select: a,
});
```

Use `notExists` instead to select Authors without matching Books.

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

`em.query` prunes unnecessary clauses exactly like [find queries](./queries-find#condition--join-pruning): a condition that evaluates to `undefined` is dropped, and a join that is never referenced by any remaining clauses is also dropped as well.

This seems weird! Why would we purposefully _drop_ conditions?

The reason is that makes for surprisingly great DX, where you don't need to use imperative `if/else` or ternary conditionals to build your queries, you can just declare the maximal shape, and let Joist figure out "what's actually needed".

```ts
const { name, title } = req.filter; // either may be undefined
const rows = await em.query({
  select: { name: a.firstName },
  from: a,
  join: [a.books.as(b)],
  // Just use the filters as-is, no conditional spreads
  where: [a.firstName.eq(name), b.title.eq(title)],
});
```

If `title` is `undefined`, then the `b.title.eq` condition is dropped, nothing references `b` anymore, and so the join to `books` disappears too.

Just like conditions & joins can be pruned, entire subqueries can be pruned, for example this entire `.in` condition & entire subquery is pruned away if `bookTitle` ends up `undefined``:

```ts
const { bookTitle } = req.filter; // string | undefined
const [a, b] = tables(Author, Book);
const authors = await em.query({
  select: a,
  from: a,
  // We only want to `.in(...books...)` when `bookTitle` is set
  where: a.id.in({
    select: b.authorId,
    from: b,
    where: b.title.eq(bookTitle),
  }),
});
```

If you need to disable pruning, you can:

* Pass `keep: true` to each individual `{ inner: ... }` join, or
* Pass `pruneJoins: false` to `em.query`

## Soft Deletes

`em.query` hides soft-deleted rows the same way `em.find` does:

- Using `from` with a soft-deletable entity auto-adds `deleted_at IS NULL` to the `WHERE` clause,
- Using _collection_ joins (o2m, m2m) auto-adds `deleted_at IS NULL` to the `ON` clause, so you don't see deleted children
- Using _reference_ joins (m2o, o2o, poly) are not filtered and _will_ return soft-deleted rows, since being able to "still FK to a soft-deleted row" is often the rationale for having a soft-deleted row in the first place

You can opt out of soft-delete filtering with `softDeletes: "include"`:

```ts
const rows = await em.query({
  select: { name: a.firstName },
  from: a,
  softDeletes: "include"
});
```

## Ordering and Paging

`orderBy` supports two forms:

- The **select form** uses keys from `select`, each set to `"ASC"` or `"DESC"`:

  ```ts
  const rows = await em.query({
    from: a,
    select: { name: a.firstName, bookCount: b.id.count() },
    orderBy: [{ name: "ASC" }, { bookCount: "DESC" }],
  });
  ```

  You can also use `"ASC NULLS FIRST"` or `"ASC NULL LAST"`.

  With this form, you can only order by the fields you're selecting.

- The **expression form** takes an array of objects with two keys: `sort` being any arbitrary SQL expression, and `order` being its order:

  ```ts
  orderBy: [
    { sort: b.id.count(), order: "DESC" },
    { sort: a.firstName, order: "ASC", nulls: "last" },
  ];
  ```

- This 2nd expression form can also be used by calling `.asc()` or `.desc()` methods on columns or other expressions:

  ```ts
  orderBy: [b.id.desc(), a.firstName.asc()],
  ```


## Composing Multiple Queries

Usually queries are object literals passed directly to `em.query`, but you can also assign them to `const`s for reuse/abstractions using the `query` function:

```typescript
const bookStats = query({
  from: b,
  groupBy: [b.authorId],
  select: { authorId: b.authorId, bookCount: b.id.count() },
  as: "book_stats",
});

// Then use it later in another query
const rows = await em.query({
  from: a,
  join: [{ left: bookStats, on: bookStats.authorId.eq(a.id) }],
  select: { name: a.firstName, bookCount: bookStats.bookCount.coalesce(0) },
});
```

:::

## Using CTEs

You can add CTEs to a query with the `with` keyword, passing the `query(...)`s that will define the CTE.

```ts
// Declare a `book_stats` CTE
const bookStats = query({
  from: b,
  groupBy: [b.authorId],
  select: { authorId: b.authorId, bookCount: b.id.count() },
  as: "book_stats",
});
// Use it in another query
const rows = await em.query({
  with: bookStats,
  from: a,
  join: [{ inner: bookStats, on: bookStats.authorId.eq(a.id) }],
  select: { name: a.firstName, bookCount: bookStats.bookCount },
});
```

Creates this SQL:

```sql
WITH book_stats AS (
  SELECT b.author_id AS "authorId", count(b.id)::int AS "bookCount"
  FROM books AS b WHERE b.deleted_at IS NULL GROUP BY b.author_id
)
SELECT a.first_name AS name, book_stats."bookCount" AS "bookCount"
FROM authors AS a JOIN book_stats ON book_stats."authorId" = a.id
WHERE a.deleted_at IS NULL
```

You can use `recursiveQuery` for `WITH RECURSIVE` CTEs, they are a little different because they involved both a base & recursive case:

```ts
const tree = recursiveQuery(
  // Declare the 2nd
  "tree",
  // Declare the base case
  { from: a, where: a.mentor_id.eq(null), select: { id: a.id, name: a.firstName } },
  // Declare the recursive case, which joins against
  // the `self` param which is the base/recursive case.
  (self) => ({
    from: a,
    join: [{ inner: self, on: a.mentor_id.eq(self.id) }],
    select: { id: a.id, name: a.firstName },
  }),
);
const rows = await em.query({ with: tree, from: tree, select: tree });
```

Create this SQL:

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

## Unions and Intersections

Set operations like `union`, `interset`, etc. are supported by passing a top-level `union` key and then a list of the query to combine:

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

We support `union`, `unionAll`, `intersect`, `intersectAll`, `except`, and `exceptAll`.

