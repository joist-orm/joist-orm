---
title: Large Collections
sidebar_position: 4
---

In Joist, large collections are one-to-many collections (like `author.books`) that would fundamentally load too much data (like a single author having 100k books), such that we want to prevent code from accidentally loading the collection by mistake.

Normally, `joist-codegen` automatically generates loadable one-to-many collections in your domain modal. For example, given a `books.author_id` foreign key, your code can immediately do:

```typescript
const author = await em.load(Author, "a:1");
const books = await author.books.load();
```

Or use `books` in a load hint:

```typescript
const author = await em.load(Author, "a:1", "books");
console.log(author.books.get);
```

Both of which will load/preload the full `author.books` collection into memory for easy access.

Usually this is great, *unless* we know when designing the schema that `author.books.load()` is fundamentally likely to pull in too much data and blow our up `EntityManager`'s entity limit (which is 10,000 entities by default).

In this scenario, we can tell Joist to treat `books` as a large collection, by setting `large: true` in the `joist-config.json`:

```json
{
  "entities": {
    "Author": {
      "relations": {
        "books": { "large": true }
      }
    }
  }
}
```

Now, `joist-codegen` still generates an `Author.books` property, however it will be typed as a `LargeCollection` which:

* Does not have a `.load()` method, and
* Cannot be used in a load hint

Both of which prevent the collection from accidentally being fully loaded into memory, and prevents developers from having to "just know" not to load `author.books` while writing business logic.

Instead, the `LargeCollection` relation only supports a few known-safe methods that work without fully loading it into memory:

```typescript
const author = await em.load(Author, "a:1");
const b1 = await em.load(Book, "b:1");

// Adding/removing the book
author.books.add(b1);
author.books.remove(b1);

// Probing if `b1` is in `author.books`
await author.books.includes(b1);

// Probing if `bookId` is in `author.books`
const b2 = await author.books.find(bookId);
```
