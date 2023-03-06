---
title: Find Queries
sidebar_position: 3
---

Find queries are Joist's minimalist syntax for building `SELECT` queries that load entities. They look like this:

```ts
const reviews = await em.find(BookReview, {
  book: { author: { publisher: p1 } }
});
```

And are all methods on the `EntityManager`.

## Structure

Find queries are made up of three parts:

1. A join literal that describes the tables to join,
2. Inline conditions within the join literal itself, and
3. Explicit conditions that are passed as a separate argument

The join literal is the main part that "walks the graph" of entities/tables to join into the query.

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
await em.find(Book, { title: "b1" })
await em.find(Book, { title: { ne: "b1" } })
await em.find(Book, { publishedAt: { gte: jan1 } })
// Or conditions within any nested join literal like `author`
await em.find(Book, { author: { firstName: { in: ["a1", "a2"] } } })
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
await em.find(Book, { title: "b1", author: a1 })
```

Finds books with the title is `b1` __and__ the author is `a:1`:

```sql
SELECT * FROM books WHERE title = 'b1' AND author_id = 1;
```

Inline conditions can be any of the following formats/operators:

* Just the value itself, i.e. `{ firstName: "a1" }`
  * `{ firstName: ["a1", "a2"] }` becomes `first_name IN ("a1", "a2")`
* Just the entity itself, i.e. `{ publisher: p1 }`
  * `{ publisher: [p1, p2] }` becomes `publisher_id IN (1, 2)`
* A variety of operator literals, i.e.
  * `{ eq: "a1" }`
  * `{ ne: "a1" }`
  * `{ eq: null }` becomes `IS NULL`
  * `{ ne: null }` becomes `IS NOT NULL`
  * `{ in: ["a1", "b2", null] }`
  * `{ lt: 1 }`
  * `{ gt: 1 }`
  * `{ gte: 1 }`
  * `{ lte: 1 }`
* An operator literal can also include multiple keys, i.e.:
  * `{ gt: 1, lt: 10 }` becomes `> 1 AND < 10`
* An operator literal can also use an explicit `op` key, i.e.:
  * `{ op: "eq", value: "a1" }` 
  * `{ op: "in", value: ["a1", "a2"] }`

:::tip

The `op` format is useful for frontend UIs where the operator is bound to a drop-down, i.e. select ">=" or "<=" or "=" , as then the select field can be down to the single `op` key, instead of adding/removing the `gt`/`lt`/`eq` keys based on the currently-selected operator.

:::

## Explicit Conditions

While inline conditions are very succinct, they only support `AND`s.

Explicit conditions allow complex conditions, i.e. `AND` and `OR`s that can be nested arbitrarily deep.

To support this, explicit conditions introduce the concept of "aliases", which allow conditions to be created _outside_ of join literal, in a 3rd `conditions` argument that can be organized orthogonally to how the tables are joined into the query.

For example, to do an `OR`:

```ts
const b = alias(Book);
await em.find(
  Book,
  { as: b },
  { conditions:
    { or: [b.title.eq("b1"), b.author.eq(a1)] }
  }      
);
```

So we still have the join literal, but the `as` keyword binds the `b` alias to the `books` table, and then we can create an `OR` expressions after.

Splitting the aliases out allows `OR` expressions that touch separate tables, by using an alias for each table:

```ts
const [b, a] = aliases(Book, Author);
await em.find(
  Book,
  { as: b, author: a },
  { conditions:
    { or: [b.title.eq("b1"), a.firstName.eq("a1")] }
  }      
);
```

The aliases use method calls to create conditions (i.e. `.eq(1)`), which is a different syntax than the inline condition's `{ eq: 1 }` literals, but the supported operations are still the same:

* `eq("b1")`
* `ne("b1")`
* `lt(1)`
* `gt(1)`
* `lte(1)`
* `gte(1)`
* `gte(1)`

## Condition & Join Pruning

Find queries have special treatment of `undefined`, to facilitate constructing complex queries:

* any condition that has `undefined` as a value will be dropped, and
* any join that has no conditions actively using the joined table will also be dropped

This allows building queries from `filter`s like:

```ts
// Either firstName or publisherId may be defined
const { firstName, publisherId } = req.filter;
const rows = await em.find(
  Book,
  { firstName, author: { publisher: publisherId } }
)
```

Where if the `req.filter` does not have `publisherId` set (because it was not submitted for this query), then:

* There will not be `WHERE` clause for `author.publisher_id`
* There will not be a join from `books` to `authors`

The win here is that, without the pruning feature, the filter construction code would have to manually join in the `authors` table only if `publisherId` was defined, to avoid making the query more expensive than it needs to be.

:::tip

This means if you want to filter on "is null", you need to use an explicit `firstName: null` or `firstName: { eq: null }` instead of assuming that `undefined` will be treated as `null`.

This approach is admittedly contrary to `null` vs. `undefined` behavior in the rest of Joist, where `undefined` _is_ converted to `NULL` i.e. when saving column values to the database.

:::



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

### `#findOne`

```ts
const em = newEntityManager();
const author = await em.findOne(Author, { email: 'foo@bar.com" });
```

### `#findOneOrFail`

```ts
const em = newEntityManager();
const author = await em.findOneOrFail(Author, { email: "foo@bar.com" });
```

### `#findOrCreate`

```ts
const em = newEntityManager();
const author = await em.findOrCreate(Author, { email: "foo@bar.com" });
```
