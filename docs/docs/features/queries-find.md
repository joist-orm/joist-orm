---
title: Find Queries
sidebar_position: 3
---

Find queries are Joist's ergonomic API for issuing `SELECT` queries to load entities from your database. They look like this:

```ts
// Find all BookReviews for a given Publisher
const reviews1 = await em.find(BookReview, {
  book: { author: { publisher: "p:1" } },
});

// Find all BookReviews of Books with foo in the title
const reviews2 = await em.find(BookReview, {
  book: { title: { like: "%foo%" } },
});
```

:::tip

You can watch this overview of `em.find` on our YouTube channel:

<div style={{display:"grid", placeContent:"center"}}>
  <iframe width="560" height="315" src="https://www.youtube.com/embed/59TA8_OjvK0?si=tj7o0OBqa74n5fwc" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

:::

:::info

As mentioned on [Loading Entities](./loading-entities), Joist's `find` methods are meant to handle the ~80-90% of SQL queries in your codebase that are simple `SELECT`s of entities with a variety of joins and conditions.

If you need more complex queries, i.e. with aggregates or subqueries, you can still use a raw query builder like Knex.

:::

## Structure

Find queries are made up of three parts:

1. A **join literal** that describes the tables to query/filter against,
2. **Inline conditions** within the join literal itself, and
3. Optional **complex conditions** that are passed as a separate argument

For example, to query all `BookReview`s for a given `Publisher`, by joining through the `Book` and `Author` tables, we start at `BookReviews` and then use nested object literals to join in the `Book` and `Author`:

```ts
const reviews = await em.find(
  BookReview,
  // this is the join literal
  { book: { author: { publisher: p1 } } },
);
```

This turns into the SQL:

```sql
SELECT br.* FROM book_reviews br
  JOIN books b ON br.book_id = b.id
  JOIN authors a ON b.author_id = a.id
WHERE a.publisher_id = 1
```

Basically the join literal creates the `JOIN <table> ON <foreign key>` clauses of the SQL statement.

The join literal is the biggest brevity win of find queries, because just adding `{ book: { author: ... } }` is much quicker than typing out the boilerplate `ON br.book_id = b.id` for each join in a query.

## Inline Conditions

Inline conditions are `WHERE` conditions that appear directly in the join literal, i.e.:

```ts
// Conditions directly in the top-level `books` join literal
await em.find(Book, { title: "b1" });
await em.find(Book, { title: { ne: "b1" } });
await em.find(Book, { publishedAt: { gte: jan1 } });
// Or conditions within any nested join literal like `author`
await em.find(Book, { author: { firstName: { in: ["a1", "a2"] } } });
```

As expected turn into the SQL `WHERE` clauses:

```sql
SELECT * FROM books WHERE title = 'b1';
SELECT * FROM books WHERE title != 'b1';
SELECT * FROM books WHERE published_at >= '2018-01-01';
SELECT * FROM books b
    INNER JOIN authors ON b.author_id = a.id
    WHERE a.first_name IN ('a1', 'a2');
```

Because these conditions are inline with the rest of the join literal, they are always `AND`-d together with any other inline condition, for example:

```ts
await em.find(Book, { title: "b1", author: a1 });
```

Finds books with the title is `b1` **and** the author is `a:1`:

```sql
SELECT * FROM books WHERE title = 'b1' AND author_id = 1;
```

Inline conditions can be any of the following formats/operators:

- Just the value itself, i.e. `{ firstName: "a1" }`
  - `{ firstName: ["a1", "a2"] }` becomes `first_name IN ("a1", "a2")`
- Just the entity itself, i.e. `{ publisher: p1 }`
  - `{ publisher: [p1, p2] }` becomes `publisher_id IN (1, 2)`
  - `{ publisher: true }` becomes `publisher_id IS NOT NULL`
  - `{ publisher: false }` becomes `publisher_id IS NULL`
  - `{ publisher: undefined }` is ignored
- A variety of operator literals, i.e.
  - `{ eq: "a1" }`
  - `{ ne: "a1" }`
  - `{ eq: null }` becomes `IS NULL`
  - `{ ne: null }` becomes `IS NOT NULL`
  - `{ in: ["a1", "b2", null] }`
  - `{ nin: ["a1", "b2"] }` becomes `NOT IN`
  - `{ lt: 1 }`
  - `{ gt: 1 }`
  - `{ gte: 1 }`
  - `{ lte: 1 }`
  - `{ like: "str" }`
  - `{ ilike: "str" }`
- An operator literal can also include multiple keys, i.e.:
  - `{ gt: 1, lt: 10 }` becomes `> 1 AND < 10`
- An operator literal can also use an explicit `op` key, i.e.:
  - `{ op: "eq", value: "a1" }`
  - `{ op: "in", value: ["a1", "a2"] }`
- An array field can also use these additional operators, i.e.:
  - `{ contains: ["book"] }`
  - `{ overlaps: ["book"] }`
  - `{ containedBy: ["book"] }`

:::tip

The `op` format is useful for frontend UIs where the operator is bound to a drop-down, i.e. select `>=` or `<=` or `=`, as then the select field can be down to the single `op` key, instead of adding/removing the `gt`/`lt`/`eq` keys based on the currently-selected operator.

:::

## Complex Conditions

While inline conditions are very succinct, they only support `AND`s.

Complex conditions allow complex conditions, i.e. `AND` and `OR`s that can be nested arbitrarily deep.

To support this, complex conditions introduce the concept of "aliases", which allow conditions to be created _outside_ of join literal, in a 3rd `conditions` argument that can be organized orthogonally to how the tables are joined into the query.

For example, to do an `OR`:

```ts
const b = alias(Book);
await em.find(Book, { as: b }, { conditions: { or: [b.title.eq("b1"), b.author.eq(a1)] } });
```

So we still have the join literal, but the `as` keyword binds the `b` alias to the `books` table, and then we can create an `OR` expressions after.

Splitting the aliases out allows `OR` expressions that touch separate tables, by using an alias for each table:

```ts
const [b, a] = aliases(Book, Author);
await em.find(Book, { as: b, author: a }, { conditions: { or: [b.title.eq("b1"), a.firstName.eq("a1")] } });
```

The aliases use method calls to create conditions (i.e. `.eq(1)`), which is a different syntax than the inline condition's `{ eq: 1 }` literals, but the supported operations are still the same:

- `eq("b1")`
- `ne("b1")`
- `lt(1)`
- `gt(1)`
- `lte(1)`
- `gte(1)`
- `gte(1)`

## Condition & Join Pruning

Find queries have special treatment of `undefined`, to facilitate constructing complex queries:

- any condition that has `undefined` as a value will be dropped, and
- any join that has no conditions actively using the joined table will also be dropped

This allows building queries from `filter`s like:

```ts
// Either firstName or publisherId may be defined
const { firstName, publisherId } = req.filter;
const rows = await em.find(Book, { firstName, author: { publisher: publisherId } });
```

Where if the `req.filter` does not have `publisherId` set (because it was not submitted for this query), then:

- There will not be `WHERE` clause for `author.publisher_id`
- There will not be a join from `books` to `authors`

The win here is that, without the pruning feature, the filter construction code would have to manually join in the `authors` table only if `publisherId` was defined, to avoid making the query more expensive than it needs to be.

:::tip

This means if you want to filter on "is null", you need to use an explicit `firstName: null` or `firstName: { eq: null }` instead of assuming that `undefined` will be treated as `null`.

This approach is admittedly contrary to `null` vs. `undefined` behavior in the rest of Joist, where `undefined` _is_ converted to `NULL` i.e. when saving column values to the database.

:::

## Incrementally Building Queries

Joist's filters, specifically the `FilterWithAlias` type, can be used to incrementally create/combine queries, in a fashion similar to Rails relations. For example something like:

```ts
const where: FilterWithAlias<Book> = {};
if (authorCondition) {
  where.author = authorCondition;
}
if (titleCondition) {
  where.title = titleCondition;
}
return await em.find(Book, where);
```

Often it is more ergonomic to use spreading:

```ts
await em.find(Book, {
  author: {
    ...(condition ? { achived: false } : {}),
    status: authorStatus,
  },
  title,
});
```

Although, even then Joist's "condition pruning" feature (mentioned above), is usually the most ergonomic:

```ts
await em.find(Book, {
  author: {
    achived: condition ? false : undefined,
    status: authorStatus,
  },
  title,
});
```

Nonetheless, the type of `FilterWithAlias` allows you to incrementally create/pass arond snippets of filters for better reuse.

## Polymorphic Relations

## Methods

### `#find`

Query an entity and given where clause

```ts
const em = newEntityManager();
const authors = await em.find(Author, { email: "foo@bar.com" });
```

You can also query based on an association

```ts
const books = await em.find(Book, { author: { firstName: "a2" } });
```

- Batch friendly
- Returns
  - Array of zero or more entities

### `#findOne`

```ts
const em = newEntityManager();
const author = await em.findOne(Author, { email: 'foo@bar.com" });
```

- Batch friendly
- Returns
  - Entity if one found
  - `undefined` if nothing found
  - throws `TooManyError` if more than 1 found

### `#findOneOrFail`

```ts
const em = newEntityManager();
const author = await em.findOneOrFail(Author, { email: "foo@bar.com" });
```

- Batch friendly
- Returns
  - Entity if one found
  - throws `NotFoundError` if nothing found
  - throws `TooManyError` if more than 1 found

### `#findOrCreate`

```ts
const em = newEntityManager();
const author = await em.findOrCreate(Author, { email: "foo@bar.com" });
```

### `#findWithNewOrChanged`

The normal `em.find` method creates a SQL `SELECT` statement that is issued against the database.

This is great, but it will miss any work-in-progress changes you've made to entities in the current `EntityManager` instance, i.e. if you've created new entities, or have mutated entities, that would technically match the `where` parameter, but have not been `em.flush`ed to the database yet.

This `findWithNewOrChanged` provides this capability, to find against both unloaded rows from the database, as well as any WIP changes to entities in the current `EntityManager` instance.

Because we evaluate this "where clause" in memory, the `where` parameter is limited to a flat set of fields immediately on the entity, i.e. primitives, enums, and many-to-ones, without any nested, cross-table joins/conditions.

```ts
const em = newEntityManager();
const author = await em.findWithNewOrChanged(Author, { email: "foo@bar.com" });
```
