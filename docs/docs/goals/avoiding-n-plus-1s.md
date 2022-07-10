---
title: Avoiding N+1s
sidebar_position: 2
---

Joist is built on top of Facebook's [dataloader](https://github.com/graphql/dataloader) library, which avoids N+1s in a fundamental, systematic way that almost always "just works".

This solid foundation comes Joist's roots as an ORM for GraphQL environments, which are particularly prone to N+1s (see section below), but is a boon to any system (REST, grpc, etc.) working with relational data. 

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

Without Joist (or a similar Dataloader-ish approach), the risk is each `book.reviews.load()` causes its own `SELECT * FROM book_reviews WHERE book_id = ...`. I.e. the 1st loop calls `SELECT ... WHERE book_id = 1`, the 2nd loop calls `SELECT ... WHERE book_id = 2`, etc., such that if we have `N` books, we will make `N` SQL queries, one for each book id.

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

## Type-Safe Preloading

While the 1st snippet shows that Joist avoids N+1s in `async` / `Promise.all`-heavy code, Joist also supports populate hints, which not only **preload the data** but also **change the types to allow non-async access**. 

With Joist, the above code can be written as:

```typescript
// Get an author and their books _and_ the books' reviews
const author = await em.load(Author, "a:1", { books: "reviews" });
// Do something with each book _and_ its reviews ... with no awaits!
author.books.get.map((book) => {
  const reviews = book.reviews.get;
});
```

See [Type-Safe Relations](./type-safe-relations.md) for more information about this feature, however we point it out here because while populate hints are great for writing non-async code & avoiding N+1s (other ORMs like ActiveRecord use them), in Joist **populate hints are supported but _not required_ to avoid N+1s**.

This is key, because in a sufficiently large/complex codebase, it can be **extremely hard to know ahead of time** exactly the right populate hint(s) that an endpoint should use to preload its data in an N+1 safe manner.

With Joist, you don't have to worry anymore: if you use populate hints, that's great, you won't have N+1s. But if you end up with business logic (helper methods, validation rules, etc.) being called in an `async` loop, **it will still be fine**, and not N+1, because in Joist both populate hints & "old-school" `async/await` access are built on top of the same Dataloader-based, N+1-safe core.

## Longer Background

### Common/Tedious Pitfall

N+1s have fundamentally plagued ORMs, not just in Node/TypeScript but many/all languages, because the defacto ORM approach of modeling "relations as fields on an object" (i.e. collections like `author1.getBooks` or references like `book1.getAuthor`) is a white lie because (unless preloaded) they are not "for free" in-memory accesses, but instead _actually_ expensive I/O calls, **leading to a leaky abstraction**.

Unfortunately, writing `for` loops over objects, and accessing that object's fields, is an extremely common pattern, and typically is perfectly safe (cheap) to do; however, ORMs that historically "hide" the expensive I/O call break this assumption.

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

Joist's auto-batching works for any `em.load` calls (or lazy-load calls `author.books.load()`, etc.) that happen synchronously within a tick of the event loop.

This means that auto-batching works for either "simple/obvious" cases like calling `book.reviews.load()` in `books.map(book => ...)` lambda, or **disparately across separate methods** that are still invoked (essentially) simultaneously, which is exactly what happens with GraphQL resolvers.

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
