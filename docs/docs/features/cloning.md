---
title: Entity Cloning
sidebar_position: 4
---

Joist supporting cloning entities, to easily support feature requests like "duplicate this author", or "duplicate this author and all of their books".

To clone an entity, call `em.clone` and pass a load-hint of the subgraph you want to be included in the `clone` operation.

For example, to clone an `Author` plus all of their `Book`s and all of the `Book`'s `BookReview`s, you can call:

```typescript
const a1 = await em.load(Author, "a:1");
const a2 = await em.clone(a1, { books: "reviews" })
```

After the `em.clone` is finished:

* `a2` will be a copy of `a1` with all the same primitive field values, but a new primary key/new identity
* Each `Book` in `a1.books` will have a new `Book` instance created, and be correctly hooked up to `a2` instead of the original `a1`
* Each `BookReview` in each `a1.books.reviews` will have a new `BookReview` instance created, and again be correctly up to the right newly-created `Book` instance in `a2.books`

Besides setting the correct "parent" `book.author` to `a2` for each cloned child `Book`, any other references/FKs in the newly-created entities that happened to point to also-cloned input entities (like `a1.favoriteBook` pointing to `a1.books.get[0]`) are adjusted to point to the correct/corresponding newly-cloned output entity.

Basically Joist will keep the subgraph of cloned entities intact.
