---
title: Avoiding N+1s
sidebar_position: 2
---

Joist is built on top of Facebook's [dataloader](https://github.com/graphql/dataloader) library, which allows it fundamentally avoid N+1s in a systematic way that almost always "just works".

## Background

The term "N+1" is what happens for code that looks like:

```typescript
// Get an author and their books
const author = await em.load(Author, "a:1");
const books = await author.books.load();

// Do something with each book
await Proimse.all(books.map(async (book) => {
  // Load this book's reviews
  const reviews = await book.reviews.load();
}));
```

The risk is that if each invocation of `book.reviews.load()` causes a `SELECT * FROM book_reviews WHERE book_id = 1`, then `SELECT * FROM book_reviews WHERE book_id = 2`, then `... WHERE book_id = 3`, etc., then if we have `N` books, we will make `N` SQL queries (one for each book id).

If we count the initial `SELECT * FROM books WHERE author_id = 1` query as `1`, this means we've made `N + 1` queries to process each of the author's books, hence the term N+1.

## Common/Tedious Pitfall

N+1s have fundamentally plagued ORMs, not just in Node/TypeScript but basically all programming languages & ORMs, because at the end of the day the ORM approach of modeling "foreign keys as collections" (i.e. `book.reviews` "looks like an in-memory collection", but _actually_ requires an expensive I/O call to load) clashes with the usual (in-memory) semantics that "collections are cheap to access", **leading to a leaky abstraction**.

Unfortunately, writing `for` loops, like above, that access a collection is a common and natural pattern for programmers to use, and typically is perfectly safe to do; however, and ORMs risk breaking this assumption.

In ORM like ActiveRecord, N+1s happen by default, and the programmer needs to tell ActiveRecord ahead of time which collections to preload, i.e. in Ruby:

```ruby
author = Author.find_by_id("1");
# The `include(:reviews)` means reviews are fetched before the `for` loop
books = Book.find({ author_id: author.id }).include(:reviews)
books.each do |book|
  # Now access the collection, and it's already in-memory
  reviews = book.reviews.length;
end
```

This resolves the performance issue, but relies on programmer's knowing what data will be accessed in loops ahead of time. This is possible, but as a codebase grows and codepaths become more complicated, it can become a tedious game of whack-a-mole, as the default behavior is inherently not performant. 

## Saved By the Event Loop

Joist is able to avoid N+1s **without preload hints** by leveraging Facebook's [dataloader](https://github.com/graphql/dataloader) library to automatically batch multiple `load` operations into single SQL statements.

Dataloader leverages JavaScript's synchronous/single-thread model, which is where when JavaScript evaluates the `book.reviews.load()` method insdie of `books.map`:

```typescript
await Proimse.all(books.map(async (book) => {
  const reviews = await book.reviews.load();
}));
```

The `load` method is fundamentally not allowed make an immediate SQL call, because it would block the thread.

Instead, the `load` method is forced to return a `Promise`, handle the I/O off the thread, and then later return the `reviews` that have been loaded.

And so the _actual_ "immediate next thing" that this code does, is that it invokes the next iteration of `books.map`, i.e. get `book 2` and immediately asks for its `reviews.load()` as well.

Ironically, this forced "nothing can block", that for years was the bane of JavaScript's programming model due to the pre-`Promise` callback hell it caused, gives Joist (via dataloader) an opportunity to wait just a _little bit_, until all of the `book.reviews.load()` have been "asked for", and the `books.map` iteration is finished, to only then see that "ah, we've been asked to do 10 `book.reviews.load`, let's do those as a single SQL statement", and execute a single SQL statement like:

```sql
SELECT * FROM book_reviews WHERE book_id IN (1, 2, 3, ..., 10);
```

### Control Flow

It is a little esoteric, but dataloader implements this by automatically managing "flush" events in JavaScript's event loop. Specifically, the event loop execution will look like (each "Tick" is a synchronous execution of logic on the event loop):

- Tick 1, call `books.map` for each book, and synchronously
  - For book 1, call `load`, there is no existing "flush" event, so dataloader creates one at the end of the queue, with `book:1` in it
  - For book 2, call `load`, see there is already a queued "flush" event, so add `book:2` to it,
  - For book `N`, call `load`, see there is already a queued "flush" event, so add `book:N` to it
- Tick 2, evaluate the "flush" event
  - Tell Joist "load all 10 books"
  - Joist issues a single SQL statement
- Tick 3, SQL statement resolves, Joist tells dataloader "okay, here are the reviews for each of the 10 books"
  - Resolve book 1's promise with its reviews
  - Resolve book 2's promise with its reviews
  - Resolve book `N`'s promise with its reviews
- Tick 4, continue book 1's `async` function, now with `reviews` populated
- Tick 5, continue book 2's `async` function, now with `reviews` populated
- ...

## N+1-Safe GraphQL Resolvers

This auto-batching will work for any `em.load` calls that happening synchronously within a tick of the event loop, which means they can either be laid out simply, like in our example `books.map` example, or happen across seemingly-disparate method calls.

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

:::tip

Granted, Joist is GraphQL agnostic, so you may use a different API layer, like REST or GRPC.

But this example shows how dataloader's "batch anything that happens within a single tick" will batch many common patterns automatically/for free, in a way that is so powerful it almost seems like JavaScript's event loop was designed from day one to purposefully support this, but instead it evolved almost by accident/happenstance.

:::

## Preloading Is Still Allowed

Granted, while we used this `async` / `Promise.all`-heavy example for illustrating how N+1 prevention works:

```typescript
const author = await em.load(Author, "a:1");
const books = await author.books.load();
await Proimse.all(books.map(async (book) => {
  const reviews = await book.reviews.load();
}));
```

Joist _also_ supports preloading, which dramatically tidies up the code:

```typescript
const author = await em.load(Author, "a:1", { books: "reviews" });
author.books.get.map((book) => {
  const reviews = book.reviews.get;
});
```

See the next [Type-Safe Relations](./type-safe-relations.md) page for more information about that feature, but nonetheless the important point is that, in a sufficiently complex codebase, it's **extremely hard to know ahead of time** what data the business logic will or will not need.

But with Joist's N+1 avoidance, the performance profile of using preload hints (i.e. in small, hand-crafted code) or not using preload hints (i.e. in complex, heavily decomposed code) is **exactly the same**.

## Where It Doesn't Work

As powerful as Joist's batching is, it only works on simple database queries like foreign key loads, i.e. `author.books.load()` or `book.author.load()`, which just navigate the object graph.

If you are doing a complex query within a loop:

```typescript
const books = await author.books.load();
await Proimse.all(books.map(async (book) => {
  await em.find(BookReview, { book, someOther: "fancyCondition" }); 
}));
```

Then dataloader will correctly tell Joist to execute the `em.find` for all 10 books "as a batch", however, it becomes hard to combine each of the `find` queries (each of which could have arbitrarily complex where clauses/conditions) into a single SQL statement.

As of now, Joist technically _will_ `UNION` all of these `em.find`s together into a single SQL call, but the SQL query is sufficiently complex (especially if there are ~100s of them, i.e. for 100 books) that they can often break, and the feature (batching custom `em.find`s) needs to be either removed or re-worked.
