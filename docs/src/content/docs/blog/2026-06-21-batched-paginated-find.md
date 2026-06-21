---
title: Batched Paginated Finds
slug: blog/batched-paginated-finds
date: 2026-06-21
authors: shaberman
tags: []
excerpt: "Joist now auto-batches paginated em.find calls, so GraphQL fields like reviews(first: 5) can be nested deep in a query without causing N+1s."
---

Joist has always been pretty aggressive about avoiding N+1s.

If you write code like this:

```ts
for (const author of authors) {
  await author.books.load();
}
```

Joist sees the repeated `books.load()` calls, batches them together, and issues one `SELECT` for all of the authors' books.

Similarly, `em.find` is batch-friendly, so if you have several semantically-similar finds in flight at the same time:

```ts
await Promise.all([
  em.find(Book, { author: a1 }),
  em.find(Book, { author: a2 }),
  em.find(Book, { author: a3 }),
]);
```

Joist turns that into one batched query instead of three.

But until recently, this broke down for paginated `find`s--i.e. `em.find(..., { limit, offset })`--which was particularly painful in GraphQL.

## The GraphQL Shape

Imagine a typical author/book/review schema:

```graphql
type Author {
  books: [Book!]!
}

type Book {
  reviews(first: Int): [BookReview!]!
}
```

And a `Book.reviews` resolver that implements `first` with Joist's `limit` option:

```ts
export const bookResolvers: BookResolvers = {
  ...entityResolver(getMetadata(Book)),

  async reviews(book, args, ctx) {
    return ctx.em.find(
      BookReview,
      { book },
      { limit: args.first ?? undefined, orderBy: { id: "ASC" } },
    );
  },
};
```

Then a client can ask for:

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

Conceptually, this says:

1. Load author `1`.
1. Load all of the author's books.
1. For each book, load the first five reviews.

That last line is the scary one. If the author has 20 books, a naive resolver implementation will issue 20 `SELECT ... FROM book_reviews WHERE book_id = ? LIMIT 5` queries. Classic N+1.

## Why Pagination Makes This Hard

For non-paginated one-to-many loading, batching is straightforward:

```sql
SELECT br.*
FROM book_reviews br
WHERE br.book_id = ANY($1)
ORDER BY br.id ASC
```

The database returns all reviews for all books, and Joist groups them back by `book_id`.

But `reviews(first: 5)` does **not** mean "load any five reviews across all books". It means "load five reviews per book".

This SQL would be wrong:

```sql
SELECT br.*
FROM book_reviews br
WHERE br.book_id = ANY($1)
ORDER BY br.id ASC
LIMIT 5
```

Because the `LIMIT 5` applies to the whole result set. If the first book has five reviews, books two through twenty get nothing.

So historically Joist had a choice:

1. Avoid batching paginated finds, and preserve correctness by issuing one query per parent.
1. Batch incorrectly, and return the wrong rows.

Obviously correctness won, but it meant GraphQL fields like `reviews(first: 5)` could still cause N+1s.

## The New SQL Shape

Joist now batches matching paginated `em.find` calls with `CROSS JOIN LATERAL`.

For the GraphQL query above, the full request is three SQL queries:

```sql
SELECT "a".*
FROM authors AS a
WHERE a.id = ANY($1)
ORDER BY a.id ASC
LIMIT $2
```

```sql
SELECT "b".*
FROM books AS b
WHERE b.author_id = ANY($1)
ORDER BY b.id ASC
LIMIT $2
```

And then, critically, **one** query for all of the per-book paginated reviews:

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

- `_find` is Joist's small in-memory lookup table of the batched calls.
- `tag` lets Joist map returned rows back to the original resolver call.
- `arg0` is the per-call `book_id`.
- `CROSS JOIN LATERAL` runs the inner query once per `_find` row.
- The `LIMIT $3` lives inside the lateral subquery, so it applies per book, not globally.

So if GraphQL asks for `reviews(first: 5)` for 20 books, Postgres still receives one review query, but each book gets its own `ORDER BY ... LIMIT 5` semantics.

## Regular `em.find` Gets This Too

This is not GraphQL-specific. The batching happens at `em.find`:

```ts
const [aReviews, bReviews] = await Promise.all([
  em.find(BookReview, { book: b1 }, { limit: 5, orderBy: { id: "ASC" } }),
  em.find(BookReview, { book: b2 }, { limit: 5, orderBy: { id: "ASC" } }),
]);
```

As long as the paginated finds have compatible shapes--same entity, same options like `limit` / `offset` / `orderBy`, and the same logical filter shape--Joist can batch them.

That means this also helps service-layer code that loops over entities and asks for "the first N children" per entity, even if no GraphQL layer is involved.

## GraphQL Hints and Arguments

One subtle GraphQL wrinkle is load hints.

Joist's GraphQL resolver utilities can turn a selection like:

```graphql
author(id: 1) {
  books {
    reviews {
      rating
    }
  }
}
```

Into a Joist populate hint like:

```ts
{ books: "reviews" }
```

Which is great for non-argument fields.

But once the query says `reviews(first: 5)`, the field is no longer just "load the `reviews` relation". It is "run this argument-aware resolver that applies `limit: 5`".

So Joist's GraphQL hint conversion now skips selections that have arguments, allowing your resolver to run:

```ts
ctx.em.find(BookReview, { book }, { limit: args.first ?? undefined });
```

And then rely on `em.find`'s new paginated batching to avoid N+1s.

## Why This Matters

This closes a gap that came up repeatedly in real GraphQL APIs.

Without this feature, teams had to choose between:

- Avoiding nested `first` fields in GraphQL schemas.
- Writing custom bulk resolvers by hand.
- Accepting N+1s for "just a small first-five list" fields.

Now the straightforward resolver is also the efficient resolver.

You can expose natural GraphQL fields like:

```graphql
books {
  reviews(first: 5) {
    rating
  }
}
```

And still get Joist's usual "never N+1" behavior, with SQL that preserves per-parent pagination semantics.
