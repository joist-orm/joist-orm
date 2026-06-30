---
title: Batched Paginated Finds
slug: blog/batched-paginated-finds
date: 2026-06-21
authors: shaberman
tags: []
excerpt: "Joist now auto-batches paginated em.find calls, so GraphQL fields like reviews(first: 5) can be nested deep in a query without causing N+1s."
---

Joist has always been aggressive about preventing N+1s--baking dataloader-style batching "into the data layer" was the original reason we started the Joist project back in ~2020.

This auto-batching means that if you write code like:

```ts
// Loop over 100 authors
await Promise.all(authors.map(async (author) => {
  await author.books.load();
}));
```

Joist sees the repeated `books.load()` calls (_before_ they go on the wire), batches them together, and issues one `SELECT` for all the authors' books.

Similarly, Joist's `em.find` is batch-friendly, so if you have several semantically-similar `em.find`s in flight at the same time:

```ts
await Promise.all([
  em.find(Book, { author: a1 }),
  em.find(Book, { author: a2 }),
  em.find(Book, { author: a3 }),
]);
```

Joist turns that into one batched SQL query instead of three.

One wrinkle was that, historically, this auto-batching did not work _paginated_ `find`s--i.e. `em.find(..., { limit, offset })`--until now! 🎉

## The GraphQL Use Case

Joist is not a "GraphQL-only" ORM, but we're definitely "GraphQL-informed", so let's look at a GraphQL schema where "lack of paginated finds" is problematic.

Given a typical Author/Book/Review schema:

```graphql
type Author {
  books: [Book!]!
}

type Book {
  " Allow fetching a subset of the reviews. "
  reviews(first: Int): [BookReview!]!
}
```

The `first` argument on `reviews` allows a client to "limit the book reviews" they retrieve:

```graphql
query {
  author(id: 1) {
    books {
      reviews(first: 5) {
        rating
      }
    }
  }
}
```

Normally Joist's `entityResolver` can "put the entity on the wire" without any boilerplate, including relations like `reviews`, but because `reviews` has this custom `first` argument, we need implement it with `em.find`:

```ts
export const bookResolvers: BookResolvers = {
  ...entityResolver(getMetadata(Book)),

  async reviews(book, args, ctx) {
    // Normal/boring em.find query
    return ctx.em.find(
      BookReview,
      { book },
      { limit: args.first ?? undefined, orderBy: { id: "ASC" } },
    );
  },
};
```

However, b/c the GraphQL runtime ends up invoking `reviews` function "in a loop", an _unbatched_ implementation of this `em.find` would cause an N+1, as the query evaluation becomes:

1. Load author `a:1` (good, 1 SQL call)
1. Load all the author's books (good, 1 SQL call, returns 100 books)
1. For each book, load the first five reviews (eh, 100 SQL calls?)

That last line is the scary one. 😬

If the author has 100 books, our initial resolver implementation will issue 100 `SELECT ... FROM book_reviews WHERE book_id = ? LIMIT 5` queries--we've created an N+1.

## Why Pagination is Different

If Joist is so great at auto-batching, why were these paginated `em.find` calls not batched already?

For Joist's _non-paginated_ one-to-many loading, batching is really straightforward: we use pretty much the same `SELECT * FROM book_reviews` that a non-batched `SELECT` would do, but with a parameter of "an array for all requested book ids" instead of a single book id:

```sql
SELECT br.*
FROM book_reviews br
WHERE br.book_id = ANY($1)
ORDER BY br.id ASC
```

The database returns all reviews for all books, and Joist groups them back by `book_id`, so we can populate each `book`s `reviews` collection.

But `reviews(first: 5)` does **not** mean "load any five reviews across all books". It means "load five reviews _per_ book", i.e. this SQL would be wrong:

```sql
-- Wrong SQL
SELECT br.*
FROM book_reviews br
WHERE br.book_id = ANY($1)
ORDER BY br.id ASC
LIMIT 5
```

The `LIMIT 5` applies to the whole result set, so if the first book has five reviews, books two through twenty get nothing.

Given this wrinkle, i.e. it had not been immediately obvious "how to auto-batch paginated queries", we'd so far pragmatically decided to just not even try. 😅

So, historically, Joist didn't allow `em.find` to accept pagination parameters (`limit` or `offset`), and instead we had a dedicated `em.findPaginated` that was _specifically not batched_, but did accept `limit` & `offset` parameters, which callers just had to know to "not call it in a loop".

## The New Pagination SQL

Until now! The latest Joist `next` release now batches paginated `em.find` calls.

We achieve this by moving the `LIMIT` parameter from "a top-level `LIMIT`" to a "per book `LIMIT`" using a `CROSS JOIN LATERAL` statement, which looks somewhat cryptically like this:

```sql
WITH _find (tag, arg0) AS (
  SELECT unnest($1::int[]), unnest($2::int[])
)
SELECT _find.tag as tag, _data.*
FROM _find AS _find
CROSS JOIN LATERAL (
  SELECT br.*
  FROM book_reviews AS br
  WHERE br.book_id = _find.arg0
  ORDER BY br.id ASC
  LIMIT $3
) AS _data
```

The important pieces are:

- The `_find` CTE lets pass us a small in-memory "lookup table" into Postgres, with one row for each of the batched calls
  - `tag` is just a counter of "batch 0", "batch 1", "batch 2"
  - `arg0` is the per-call `book_id`, i.e. `book_id=10`, `book_id=20`, `book_id=30` if we're loading review for books `[10, 20, 30]`
- `CROSS JOIN LATERAL` runs the inner query once _per_ `_find` row.
  - This means that "each book" gets its own `SELECT ... FROM book_reviews ... LIMIT` 
- The `LIMIT $3` lives inside the lateral subquery, so it applies per book, not globally.

Tying this back to our GraphQL use case, if a GraphQL query asks for `reviews(first: 5)` across 20 books, Postgres still receives one review query, and each book gets its own `ORDER BY ... LIMIT 5` semantics.

## Removing `findPaginated`

Because we've now solved the restriction of "we cannot batch paginated finds", the reason for separate `em.find` vs. `em.findPaginated` methods has gone away, so we've also just removed `findPaginated`. 🔪

Now any `em.find` can use limit/offset parameters, and still get Joist's robust auto-batching support:

```ts
const [aReviews, bReviews] = await Promise.all([
  em.find(BookReview, { book: b1 }, { limit: 5, orderBy: { id: "ASC" } }),
  em.find(BookReview, { book: b2 }, { limit: 5, orderBy: { id: "ASC" } }),
]);
```

As long as the paginated finds have compatible shapes--same entity, same options like `limit` / `offset` / `orderBy`, and the same logical filter shape--Joist will batch them.

This first-class `em.find` support also means _any_ service-layer / business-logic code that loops over entities and asks for "the first `N` children" per entity will get an auto-batched query, even if no GraphQL is involved. 🎉

## Why This Matters

This feature finally unlocks a common GraphQL pattern: fetching "the first `N` children" for a list of parents, without having to write a custom dataloader/resolver or accept an N+1.

Previously, applications using Joist had to choose between:

- Avoiding nested `first` fields all together (honestly what we'd done 😅),
- Writing custom dataloader resolvers by hand (👎️), or
- Accepting N+1s for "just a small first-five list" fields (also 👎️)

Now the feature "just works", with a straightforward, boring implementation that leverages `em.find`, as we continue to deliver on Joist's "never N+1" mission. 🚀
