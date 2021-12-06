---
title: Lenses
---

As covered in [type safe relations](../goals/type-safe-relations.md), Joist provides populate hints to more ergonomically traverse the object graph.

For example, to get all book reviews for an author:

```typescript
const author = await em.load(
  Author,
  "a:1",
  { books: "reviews" }
);
const reviews = author.books.get.flatMap((book) => {
  return book.reviews.get;
})
console.log(`Found ${reviews.length} reviews`);
```

Another feature that allows similar "more ergonomic traversal" is `Entity.load`, which looks like:

```typescript
const author = await em.load(Author, "a:1");
const reviews = await author.load(a => a.books.reviews);
console.log(`Found ${reviews.length} reviews`);
```

## Explanation

In the above example, the `author.load` method passes its lambda the parameter `a`; this parameter is just a proxy/[lens](https://medium.com/@dtipson/functional-lenses-d1aba9e52254) records/"marks" what path to take through the object graph.

Once the lambda returns that path (i.e. `a.books.reviews` or `author -> books -> reviews`), then the `load` method internally loads/follows those paths, and returns the collection of entities that was at the "end" of the path.

## Typing

In the above example, the `a` parameter is a `Lens<Author>`, where `Lens` is a mapped type that exposes `Author`'s relations as simple keys.

Those keys themselves return new `Lens`s, i.e. `a.books` returns `Lens<Book, Book[]>` (the 2nd `Book[]` is because `books` returns multiple `Book`s).

Then `.reviews` returns `Lens<BookReview, BookReview[]>`, and since it is the "last path" / last lens, that is who the `author.load` method knows that its return type should be `BookReview[]`.
