# GQL Filtering Pattern

There are two primary ways of finding entities in GQL:

1. Finding entities via a top-level query
2. Finding entities via a graph navigation

For example, finding `Book` entities via a top-level query would look like:

```graphql
query {
  books {
    id
    title
  }
}
```

Where as finding `Book` entities via graph navigation would be first finding authors and then finding the author's books:

```graphql
query {
  authors {
    books {
      id
      title
    }
  }
}
```

In general, Joist supports both of these patterns equally well (i.e. without N+1s in the `authors / books` case).

However, complex filtering can be problematic and so is worth highlighting, pragmatically, how to handle to avoid performance issues.

### Top-Level Queries Can Use Complex Filters

When issuing a top-level query like `query / books(filter: ...)`, Joist's `EntityManager` has a `findGql` method that makes it generally very easy to map non-trivial/idiomatic GQL filtering onto an efficient/join-backed database filter.

So if you want to do a query like "find books who's total royalties is >= \$100k", it's kosher to build this like:

```graphql
query {
  books(filter: { totalRoyalties: { gt: 100000 } }) {
    id
    title
    author {
      firstName
    }
  }
}
```

And then in your resolver map `totalRoyalties` to a join in `em.find` or `em.findGql`.

At runtime, the GraphQL execution flow is:

1. Find all `Book`s by calling `queryResolvers.books`, which will probably make an `em.find` call
2. For each found `Book`, call `bookN.authorRef.load()` _per book_, which Joist automatically batches into a single `SELECT * FROM authors WHERE book_id IN (...)`

So this is a safe pattern because we've done 1 initial "potentially complex filter" `em.find` and then a series of "known to be really simple" `one-to-many` / `many-to-one` loads/navigations that Joist knows how to efficiently batch.

### Graph-Navigation Queries _Should Not_ Use Complex Filters

However, unlike the previous top-level queries, graph-navigation _complex_ queries can run into performance issues.

To see why, let's turn the previous top-level "books with \$100k in royalties" into a graph-navigation query by starting first at `authors`, i.e.:

```graphql
query {
  authors {
    firstName
    books(filter: { totalRoyalties: { gt: 100000 } }) {
      id
      title
    }
  }
}
```

Note how we're using the same complex filter, but now at one nested level deeper within the query.

At runtime, the GraphQL execution flow for this query is:

1. Find all authors that match `authors` using `em.find`
2. For each found `Author`, call `authorResolvers.books(root: authorIdN, filter: ...)`, which, assuming the `filter` is implemented by database filtering, makes another `em.find` call _per author_

And so here is the difference: in 1st example of calling `books(...) / author` we're calling many `reference.load` calls (which are batched easily), where as in `authors / books(...)` we're calling many `em.find` calls (which are hard to batch).

And, unfortunately, although Joist does _attempt_ to batch `em.find` calls, they are simply not as efficient as batching `reference.load` calls, b/c the `em.find` `where` clauses can be arbitrarily complex.

For example, Joist might see two `em.find` calls:

```typescript
const a = em.find(Book, { title: { ... }});
const b = em.find(Book, { published: { ... }});
```

Joist _does_ batch these two queries together, but because of the arbitrarily-complex `where` clauses (instead of just `WHERE id IN (...a combined list...)` like for `reference.load`), the SQL that gets put on the wire is calling:

```sql
SELECT 1 as _tag, * FROM books WHERE title ...
UNION ALL
SELECT 2 as _tag, * FROM books WHERE published ...
```

Where we will get a single result set from the database, but we have admittedly a somewhat Frankenstein query by just smushing each `find` query together with `UNION ALL`.

This is cute, and technically works, but only works well in the small.

If you have a GraphQL query that returns 500 authors, and then ask for each author's books with an `em.find` call, you'll end up with a single SQL call with 500 separate queries all `UNION ALL`'d together. Which a) just seems terrible in theory, and b) is also terrible in practice and can lead to ~30-second plus CPU spikes/stalls for your server.

The upshot from all of this: don't auto-batch lots of `em.find` calls because the performance will probably suck.

### Tldr Recommended Pattern

Joist's general recommendation is:

1. Only do complex/database-level filtering on top-level queries.

   For example, `BooksFilter` is a good pattern for a top-level `books` query:

   ```graphql
   input BooksFilter {
     title: StringFilter
   }

   query {
     books(filter: BooksFilter): [Book!]!
   }
   ```

   `BooksFilter` can have an ~arbitrary number of fields, some implemented by complex db joins, and everything will be fine.

2. Only do in-memory filter for graph navigation filtering

   For example, do _not_ use `BooksFilter` for modeling within `Author`:

   ```graphql
   type Author {
     books(isPublished: Boolean): [Book!]!
   }
   ```

   And then implement the `authorResolvers.books` by just calling the Joist-provided `author.books.load()` and then doing in-memory "if `isPublished`" filter.

   (Note that we're explicitly not using the `filter: ...` naming convention to remind us that this is not/should not be the same database filter used by a top-level query.)

### Handling Boundary Cases

Note that if you _must_ do complex queries across entities, i.e. books and authors, the recommendation is to make two top-level queries and have the client stitch the results together. For example:

```graphql
query {
  books(filter: { bookComplexCondition: true }) {
    id
    title
  }
  authors(filter: { book: { bookComplexCondition: true }, authorComplexCondition: true }) {
    id
    firstName
  }
}
```

This will give the client the data it needs: the books and authors that pass both the complex `bookComplexCondition` as well as the `authorComplexCondition`, but without running into degenerate nested `em.find` calls.
