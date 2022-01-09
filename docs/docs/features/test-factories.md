---
title: Test Factories
sidebar_position: 2
---

Joist generates customizable factories for easily creating test data.

I.e. for a `Book` entity, Joist will one-time generate a `Book.factories.ts` file that looks like:

```typescript
import { EntityManager, FactoryOpts, New, newTestInstance } from "joist-orm";
import { Book } from "./entities";

export function newBook(em: EntityManager, opts?: FactoryOpts<Book>): New<Book> {
  return newTestInstance(em, Book, opts);
}
```

Tests can then invoke `newBook` with as little opts as they want, and all required defaults (both fields and entities) will be filled in.

I.e. since `book.author_id` is a not-null column, calling `const b1 = newBook()` will create both a `Book` with a `title` (required primitive field) as well as create a new `Author` (required foreign key/many-to-one field) and assign it to `b1.author`:

```typescript
const b = newBook();
expect(b.title).toEqual("title");
expect(b.author.get.firstName).toEqual("firstName");
```

This creation is recursive, i.e. `newBookReview()` will make a new `BookReview`, a new `Book` (required for `bookReview.book`), and a new `Author` (required for `book.author`).

You can also pass partials for either the book or the author:

```typescript
const b = newBook({ author: { firstName: "a1" } });
// title was not in opts, so it gets the same default
expect(b.title).toEqual("title");
// author.firstName was in opts, so it's used for the firstName field
expect(b.author.get.firstName).toEqual("a1");
```

The factories will usually make new entities for required fields, but will reuse an existing instance if:

1. The `EntityManager` already as a _single_ instance of that entity. I.e.:

   ```typescript
   // We have a single author
   const a = newAuthor();
   // Making a new book will see "there is only 1 author" and assume we want to use that
   const b = newBook();
   expect(b.author.get).toEqual(a);
   ```

2. If you pass entities as a `use` parameter. I.e.:

   ```typescript
   // We have multiple authors
   const a1 = newAuthor();
   const a2 = newAuthor();
   // Make a new book review, but use a2 instead of creating a new Author
   const br = newBookReview({ use: a2 });
   ```

   This will make a new `BookReview`, and a new `Book`, but when filling in `Book.author`, it will use `a2`.

   (Note that `use` is specifically useful for passing entities to use "several levels up the tree", i.e. if you were making a `newBook` you could directly pass `newBook({ author: a2 })`. In the `newBookReview` example, author is not immediately set on the `BookReview` itself, so we put `a2` in the `use` opt for the factories to "use it as needed/up the tree".)

The factory files can be customized, i.e.:

```typescript
export function newBook(em: EntityManager, opts?: FactoryOpts<Book>): New<Book> {
  return newTestInstance(em, Book, {
    // Assume every book should have 1 review by default. This can be a partial that will
    // be recursively filled in. It will also be ignored if the caller passes
    // their own `newBook(em, { reviews: ... })` opt.
    reviews: [{}]
    // Give a unique-ish name, testIndex will be 1/2/etc increasing and reset per-test
    title: `b${testIndex}`
    ...opts
  });
}
```

And then every caller of `newBook` will get these defaults.

Note that you can also customize the `opts` type to add your own application-specific hints, i.e.:

```typescript
export function newBook(em: EntityManager, opts?: FactoryOpts<Book> & { withManyReview?: boolean }): New<Book> {
  // if opts?.withManyReview then make 10 reviews
}
```

### Auto-Refreshing Test Instances

The `EntityManager.refresh` method reloads all currently-loaded entities from the database, as well as any of their loaded relations (i.e. if you have `author1.books` loaded and a new `books` row is added with `author_id=1`, then after `refresh()` the `author1.books` collection will have the newly-added book in it).

This is primarily useful for tests, where you want to do behavior like:

```typescript
// Given an author
const a = em.create(Author, { ... });
// When we perform the business logic
// (...assumme this is a test helper method that invokes the logic and
// then calls EntityManager.refresh before returning)
await run(em, (em) => invokeBusinessLogicUnderTest(em));
// Then we have a new book
expect(a.books.get.length).toEqual(1);

// Defined as a helper method
async function run<T>(em, fn: async () => Promise<T>): Promise<T> {
  // Flush existing test data to the db
  await em.flush();
  // Make a new `em` however that is done for your app
  const em2 = newEntityManager();
  // Invoke business logic under test
  const result = await fn(em2);
  // Reload our test's em to have the latest data
  await em.refresh();
}
```

This runs `invokeBusinessLogicUnderTest` in its own transaction/`EntityManager` instance (to avoid accidentally relying on the test's `EntityManager` state), but after `invokeBusinessLogicUnderTest` completes, the test's Author `a` local variable can be used for assertions and will have the latest & great data from the database.

Without this approach, tests often jump through various hoops like having duplicate `a1`/`a1Reloaded` variables that are explicitly loaded:

```typescript
const a1 = em.create(Author, { ... });
await invokeBusinessLogicUnderTest(em);
// load the latest a1
await a1_2 = em.load(Author, a1.idOrFail);
```

Joist's `EntityManager.refresh` method and the `run` helper method convention let's you avoid doing this "load the latest X" in all of your tests.
