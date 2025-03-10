---
title: Lens Traversal
description: Documentation for Lens Traversal
---

Lenses provide quick navigation the object graph, for example to navigate from an `Author` `a:1` to all of its books, and all of its book's reviews, you can write:

```typescript
// Load an author as usual
const author = await em.load(Author, "a:1");
// The `a.books.reviews` creates a lens/path to navigate
const reviews = await author.load(a => a.books.reviews);
console.log(`Found ${reviews.length} reviews`);
```

Behind the scenes, the above code executes exactly the same as using Joist's populate hints to preload and then `.get` + `.flatMap` across preloaded relations:

```typescript
// Load an author but with a populate hint
const author = await em.load(
  Author,
  "a:1",
  { books: "reviews" }
);
// Now flatMap book reviews w/o any awaits
const reviews = author.books.get.flatMap((book) => {
  return book.reviews.get;
})
console.log(`Found ${reviews.length} reviews`);
```

Both of these features prevent `await` hell (by having only a single `await` and then otherwise synchronous code), and which one is better depends on your need:

* If you need to apply filters and transformation logic, the populate hint with explicit `.get`s` and `.flatMap`s is better b/c you can intersperse your custom logic as needed.
* If you just need to do a simple/no filtering/no transformation navigation of the object graph, then the lens `.load` approach is more succint.

## Explanation

In the above example, the `author.load` method passes its lambda the parameter `a`; this parameter is just a proxy/[lens](https://medium.com/@dtipson/functional-lenses-d1aba9e52254) records/"marks" what path to take through the object graph.

Once the lambda returns that path (i.e. `a.books.reviews` or `author -> books -> reviews`), then the `load` method internally loads/follows those paths, and returns the collection of entities that was at the "end" of the path.

## Typing

In the above example, the `a` parameter is a `Lens<Author>`, where `Lens` is a mapped type that exposes `Author`'s relations as simple keys.

Those keys themselves return new `Lens`s, i.e. `a.books` returns `Lens<Book, Book[]>` (the 2nd `Book[]` is because `books` returns multiple `Book`s).

Then `.reviews` returns `Lens<BookReview, BookReview[]>`, and since it is the "last path" / last lens, that is who the `author.load` method knows that its return type should be `BookReview[]`.
