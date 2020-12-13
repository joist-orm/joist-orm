# GQL Filtering Pattern

There are two primary ways of finding entities in GQL:

1. Finding entities via a top-level query
2. Finding entities via a graph navigation

For example, finding books via a top-level query would look like:

```graphql
query {
  books {
    id
    title
  }
}
```

Where as books via graph navigation would be first finding authors and then finding the author's books:

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

In general, Joist supports both of these patterns equally well (i.e. without N+1s) as long as you're vanilla graph traversal, i.e. with no/minimal filtering and are just following foreign key references/collections.

However, finding entities with complex/database-driven filtering logic can be problematic _when using graph navigation_, so this doc highlights what that issue is, and how to avoid it.

### Top-Level Queries Can Use Complex Filters

When issuing a top-level query like `query / books(filter: ...)`, Joist's `EntityManager` has a `findGql` method that makes it generally easy to map idiomatic GQL filtering conventions onto an efficient/join-backed database query.

So if you want to do a query like "find books who's total royalties is >= $100", it's kosher to build a query like:

```graphql
query {
  books(filter: { totalRoyalties: { gt: 100 } }) {
    id
    title
    author {
      firstName
    }
  }
}
```

And then in your resolver, implement the `totalRoyalties` filter logic via a join in `em.find` or `em.findGql`.

At runtime, the GraphQL execution flow is:

1. Find all books by calling `queryResolvers.books` once, which will probably make an `em.find(Book, ...)` call.
   
2. For each found book, call `booksResolver.author(bookIdN, ...)`, which calls `em.load(bookIdN).authorRef.load()`.
   
   Joist automatically batches all of these individual `load()` calls into a single `SELECT * FROM authors WHERE book_id IN (...)`.

So this is a safe pattern because we've done 1 initial "potentially complex filter" `em.find` and then a series of "known to be really simple" `one-to-many` / `many-to-one` loads/navigations that Joist knows how to efficiently batch.

### Graph-Navigation Queries _Should Not_ Use Complex Filters

However, unlike the previous top-level queries, graph-navigation _complex_ queries can run into performance issues.

To see why, let's turn the previous top-level "books with $100 in royalties" into a graph-navigation query by starting first at `authors`, i.e.:

```graphql
query {
  authors {
    firstName
    books(filter: { totalRoyalties: { gt: 100 } }) {
      id
      title
    }
  }
}
```

Note how we're using the same complex filter, but now at one nested level deeper within the query.

At runtime, the GraphQL execution flow for this query is:

1. Find all authors that match `authors` using `em.find` (in this case all authors, because we didn't use a top-level filter).
   
2. For each found author, call `authorResolvers.books(authorIdN, args)`, which, assuming the `filter` is implemented by database-backed filtering, makes an additional `em.find` call _per author_.

And so here is the difference: in 1st example of calling `books(...) / author` we're calling many `reference.load` calls--but that's okay because they are easily batched. However, in the 2nd example of `authors / books(...)` we're calling many `em.find` calls--and they are more complicated to batch.

Joist does _attempt_ to batch these multiple `em.find` calls into a N+1 safe/single physical database query, however, because the `em.find`s `where` clause paramater can be arbitrarily complex, it's just not as efficient as batched `reference.load` calls.

For example, Joist might see two `em.find` calls:

```typescript
const a = em.find(Book, { title: { ... }});
const b = em.find(Book, { published: { ... }});
```

To batch these two `where` clauses together, the SQL that gets put on the wire is:

```sql
SELECT 1 as _tag, * FROM books WHERE title ...
UNION ALL
SELECT 2 as _tag, * FROM books WHERE published ...
```

Such that we will technically get a single result set from the database, but we admittedly have a somewhat Frankenstein query, where we just smushed all the separate `find` queries together with `UNION ALL`.

This is cute, and technically works, but it only works well in the small.

If you have a GraphQL query that returns 500 authors, and then asks for each author's books with an `em.find` call, you'll end up with a single SQL call with 500 separate queries all `UNION ALL`'d together. Which a) just seems terrible even in theory, and b) is also actually terrible in practice and can lead to ~30-second plus CPU spikes/stalls that completely block the event loop.

The takeaway from this is: don't auto-batch lots of `em.find` calls because the performance will probably suck.

### Tldr Recommended Pattern

To avoid this issue with complex filtering in sub-navigation, Joist's current recommendation is:

1. Only do complex/database-level filtering on top-level queries.

   For example, a `BooksFilter` input type is a good pattern for a top-level `books` query:

   ```graphql
   input BooksFilter {
     title: StringFilter
     datePublished: DateFilter
     ...
   }

   query {
     books(filter: BooksFilter): [Book!]!
   }
   ```

   `BooksFilter` can have an arbitrary number of fields, some implemented by complex db joins, and everything will be fine.

2. Only do in-memory filtering for graph navigation queries.

   For example, do _not_ use `BooksFilter` for modeling within `Author`'s `books` field, instead use an as-simple-as-possible subset of your total `BooksFilter` keys:

   ```graphql
   type Author {
     books(isPublished: Boolean): [Book!]!
   }
   ```

   And then implement the `authorResolvers.books` by just calling the Joist-provided `author.books.load()` (very N+1 safe) and then doing in-memory "if `isPublished`" filter.

   Also note that we're explicitly not using the `filter: ...` naming convention, so that we're reminded that this is not/should not be the same database filter used by a top-level query.

### Alternative to Complex-Filter Navigation Queries

Note that if you _must_ do multiple complex queries in a single query (such that you'd be tempted to make a graph navigation resolver use `em.find`), instead the recommendation is to make two top-level queries and have the client stitch the results together. For example:

```graphql
query {
  # We want all authors that pass a complex condition 
   authors(filter: { authorComplexCondition: true }) {
      id
      firstName
   }
   # As well as any books that a) are by authors that
   # pass that same authorComplexCondition, as well as
   # b) pass an additional book-specific condition
  books(filter: {
     bookComplexCondition: true,
     author: { authorComplexCondition: true },
  }) {
    id
    title
  }
}
```

This will give the client the data it needs: the "top-level" authors, as well as the "nested" books, but by using two top-level queries and passing the higher-level author condition to both `authors` and `books`.

This means we'll have two `em.find` calls, but they won't be nested in some non-N+1-safe manner.
