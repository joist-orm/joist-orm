---
title: Avoiding N+1s
description: Documentation for Avoiding N+1s
---

Joist is built on Facebook's [dataloader](https://github.com/graphql/dataloader) library, which means Joist avoids N+1s in a fundamental, systematic way that just works.

This foundation comes from Joist's roots as an ORM for GraphQL backends, which are particularly prone to N+1s (see below), but is a boon to any system (REST, GRPC, etc.). 

## N+1s: Lazy Loading in a Loop

As a short explanation, the term "N+1" is what _can_ happen for code that looks like:

```typescript
// Get an author and their books
const author = await em.load(Author, "a:1");
const books = await author.books.load();

// Do something with each book
await Promise.all(books.map(async (book) => {
  // Now I want each book's reviews... in Joist this does _not_ N+1
  const reviews = await book.reviews.load();
}));
```

Without Joist (or a similar Dataloader-ish approach), the risk is each `book.reviews.load()` causes its own `SELECT * FROM book_reviews WHERE book_id = ...`. I.e.:

- the 1st loop calls `SELECT * FROM reviews WHERE book_id = 1`,
- the 2nd loop calls `SELECT * FROM reviews WHERE book_id = 2`,
- etc.,

Such that if we have `N` books, we will make `N` SQL queries, one for each book id.

If we count the initial `SELECT * FROM books WHERE author_id = 1` query as `1`, this means we've made `N + 1` queries to process each of the author's books, hence the term N+1.

However, with Joist the above code will issue only **three queries**:

```sql
-- first em.load
SELECT * FROM authors WHERE id = 1;
-- author.books.load()
SELECT * FROM books WHERE author_id = 1;
-- All of the book.reviews.load() combined into 1 query
SELECT * FROM book_reviews WHERE book_id IN (1, 2, 3, ...);
```

This N+1 prevention works not only in our 3-line `await Promise.all` example, but also works in complex codepaths where the business logic of "process each book" (and any lazy loading it might trigger) is spread out across helper methods, validation rules, entity lifecycle hooks, etc.

:::tip[Tip]

In one of Joist's alpha features, join-based preloading, these 3 queries can actually be collapsed into a single SQL call, although achieving this does require an up-front populate hint.

:::

## Type-Safe Preloading

While the 1st snippet shows that Joist avoids N+1s in `async` / `Promise.all`-heavy code, Joist also supports populate hints, which not only **preload the data** but also **change the types to allow non-async access**. 

With Joist, the above code can be rewritten as:

```typescript
// Get an author and their books _and_ the books' reviews
const author = await em.load(Author, "a:1", { books: "reviews" });
// Do something with each book _and_ its reviews ... with no awaits!
author.books.get.map((book) => {
  // The `.get` method is available here only b/c we passed "reviews" to em.load
  const reviews = book.reviews.get;
});
```

And it has exactly the same runtime semantics (i.e. number of SQL calls) as the previous `async/await`-based code: the **same three queries** are issued for both "with populate hints" and "without populate hints" code.

See [Load-Safe Relations](./load-safe-relations.md) for more information about this feature, however we point it out here because while populate hints are great for writing non-async code & avoiding N+1s (other ORMs like ActiveRecord use them), in Joist populate hints are **supported but _not required_** to avoid N+1s.

This is key, because in a sufficiently large/complex codebase, it can be **extremely hard to know ahead of time** exactly the right populate hint(s) that an endpoint should use to preload its data in an N+1 safe manner.

With Joist, you don't have to worry anymore: if you use populate hints, that's great, you won't have N+1s. But if you end up with business logic (helper methods, validation rules, etc.) being called in an `async` loop, **it will still be fine**, and not N+1, because in Joist both populate hints & "old-school" `async/await` access are built on top of the same Dataloader-based, N+1-safe core.

## Longer Background

### Common/Tedious Pitfall

N+1s have plagued ORMs, in many programming languages, because the de facto ORM approach of "relations are just methods on an object" (i.e. `author1.getBooks()` or `book1.getAuthor()` will lazy-load the requested data from the database) causes a **leaky abstraction**--normally method calls are super-cheap in-memory accesses, but ORM methods that make expensive I/O calls are fundamentally not "super-cheap".

These methods that implicitly issue I/O calls are powerful and very ergonomic, however they are almost **too ergonomic**: it's very natural for programmers to, given a list of objects, loop over those objects and access their methods, and unwittingly cause an N+1.

For example, in Rails ActiveRecord, N+1s happen by default, and the programmer needs to tell ActiveRecord ahead of time which collections to preload:

```ruby
author = Author.find_by_id("1");
# The `include(:reviews)` means reviews are fetched before the `for` loop
books = Book.find({ author_id: author.id }).include(:reviews)
books.each do |book|
  # Now access the collection, and it's already in-memory.
  # Without `include(:reviews)` this would still work but _silently N+1_
  reviews = book.reviews.length;
end
```

This `include(:reviews)` resolves the performance issue, but relies on the programmer knowing what data will be accessed in loops ahead of time. This is possible, but as a codebase grows it becomes a tedious game of whack-a-mole, as the default behavior is inherently unsafe. 

### Saved By the Event Loop

Joist is able to avoid N+1s **without preload hints** by leveraging Facebook's [dataloader](https://github.com/graphql/dataloader) library to automatically batch multiple `load` operations into single SQL statements.

Dataloader leverages JavaScript's synchronous/single-thread model, which is where JavaScript evaluates the `book.reviews.load()` method inside of `books.map`:

```typescript
await Promise.all(books.map(async (book) => {
  const reviews = await book.reviews.load();
}));
```

The `book.reviews.load` method, when invoked, is fundamentally not allowed to make an immediate SQL call, because it would block the event loop.

Instead, the `load` method is forced to return a `Promise`, handle the I/O off the thread, and then later return the `reviews` that have been loaded.

And so the _actual_ "immediate next thing" that this code does is not "make a SQL call for book1's reviews", but instead is the next iteration of `books.map`, i.e. get `book 2` and asks for its `book.reviews.load()` as well.

Ironically, this forced "nothing can block" model, that for years was the bane of JavaScript due to the pre-`Promise` callback hell it caused, gives Joist (via dataloader) an opportunity to wait just a _little bit_, until all of the `book.reviews.load()` have been "asked for", and the `books.map` iteration is finished, to only then see that "ah, we've been asked to do 10 `book.reviews.load`, let's do those as a single SQL statement", and execute a single SQL statement like:

```sql
SELECT * FROM book_reviews WHERE book_id IN (1, 2, 3, ..., 10);
```

### Control Flow

It is a little esoteric, but dataloader implements this by automatically managing "flush" events in JavaScript's event loop. Specifically, the event loop execution will look like (each "Tick" is a synchronous execution of logic on the event loop):

- Tick 1, call `books.map` for each book, and synchronously
  - For book 1, call `load`, there is no existing "flush" event, so dataloader creates one at the end of the queue (i.e. to be invoked at the next tick), with `book:1` in it
  - For book 2, call `load`, see there is already a queued "flush" event, so add `book:2` to it,
  - For book `N`, call `load`, see there is already a queued "flush" event, so add `book:N` to it
- Tick 2, evaluate the "flush" event, with it's 10 book ids kept in an array
  - Tell Joist "load all 10 books"
  - Joist issues a single SQL statement
- Tick 3, SQL statement resolves, Joist tells dataloader "okay, here are the reviews for each of the 10 books", when the dataloader:
  - Resolves book 1's promise with its respective reviews
  - Resolves book 2's promise with its respective reviews
  - Resolves book `N`'s promise with its respective reviews
- Tick 4, continue book 1's `async` function, now with `reviews` populated
- Tick 5, continue book 2's `async` function, now with `reviews` populated
- ...

## N+1-Safe GraphQL Resolvers

Joist's auto-batching works for any `em.load` calls (or lazy-load calls `author.books.load()`, etc.) that happen synchronously within a tick of the event loop.

This means that auto-batching works for either simple/obvious cases like calling `book.reviews.load()` in `books.map(book => ...)` lambda, or **disparately across separate methods** that are still invoked (essentially) simultaneously, which is exactly what happens with GraphQL resolvers.

For example, let's say a GraphQL client has issued a query like:

```graphql
query {
  authors(id: 1) {
    books {
      reviews {
        id
        name  
      }  
    }  
  }
}
```

We might implement our `books.reviews` resolver like:

```typescript
const booksResolver = {
  async reviews(bookId, args, ctx) {
    const book = await ctx.em.load(Book, bookId);
    return await book.reviews.load();
  }
}
```

And, the way the GraphQL resolver pattern works, the GraphQL runtime will call the `booksResolver.reviews(1)`, `booksResolver.reviews(2)`, `booksResolver.reviews(3)`, etc. method for each of the books returning from our query.

This looks like it could be an N+1, however because each of the `reviews(1)`, `reviews(2)`, etc. calls has happened within a single tick of the event loop, the dataloader "flush" event will automatically kick-in and ask Joist to look all of the reviews as a single SQL call.

:::tip[Tip]

Joist is GraphQL agnostic; you can use a different API layer, like REST or GRPC, we are just using GraphQL as an example due to its N+1 prone nature.

:::

## How It Works

There are two primary components to Joist's batching:

1. Graph navigation, and
2. `em.find` queries

### Graph Navigation

To avoid N+1s during graph navigation (using methods `author.books.load` or `book.author.load` to lazy load data), Joist maintains a dataloader per relation/per edge. For example if you do:

- `await author1.books.load()`
- `await author2.books.load()`
- `await author3.books.load()`

In a loop, the `Author.books` o2m relation has a dataloader that collects `author1`, `author2`, and `author3` entities in a list and then issues a SQL single statement for books with `WHERE author_id IN (1, 2, 3)`.

Joist has dataloader implementations for all the core relations involved in graph navigation: o2m, m2o, o2o, and m2m. Their implementations are straightforward and generally rock solid.

### Find Queries

Besides graph navigation, Joist will also auto-batch `em.find` queries, which are more adhoc `SELECT` queries (see [Find Queries](../features/queries-find.md)). For example if you do:

- `await em.find(Author, { firstName: "a1", lastName: "l1" })`
- `await em.find(Author, { firstName: "a2", lastName: "l2" })`
- `await em.find(Author, { firstName: "a3", lastName: "l3" })`

In a loop, then `em.find` will batch any `SELECT` statements that have the same joins and same filtering (essentially the same query structure) in a single statement that looks like:

```sql
WITH _find (tag, arg1) AS (VALUES 
  (1, 'a1', 'l1'),
  (2, 'a2', 'l2'),
  (3, 'a3', 'l3')
)
SELECT * FROM authors a
JOIN _find ON (a.first_name = _find.arg1 AND a.last_name = _find.arg2);
```

This approach leverages the Common Table Expression (CTE) of inline values and extra `JOIN` clause to essentially apply multiple `WHERE` clauses at once. This is admittedly more esoteric than Joist's graph navigation dataloaders, but it achieves the goal of de-N+1-ing the queries.

:::note

Joist's `em.find` does not support `limit` or `offset` because they cannot be applied with the `JOIN` filtering approach. Instead, for `limit` and `offset`  you can use `em.findPaginated`, although note that `findPaginated` will not auto-batch, so you should avoid calling it in a loop.

:::
