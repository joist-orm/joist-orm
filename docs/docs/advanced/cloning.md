---
title: Entity Cloning
sidebar_position: 4
---

Joist supports cloning entities, to easily implement feature requests like "duplicate this author", or "duplicate this author and all of their books".

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

### Advanced Features

When calling `em.clone`, you can provide three config options to customize the behavior:

* `opts.deep` is the load hint from above, i.e. `{ books: "reviews" }`, that specifies the subgraph to clone.

* `opts.skipIf` is a function that accepts an entity and returns `true` if that entity should be skipped/not cloned:

   ```ts
   // This will duplicate the author's books, but skip any book where the title includes `sea`
   const duplicatedBooks = await em.clone(
     author.books.get,
     { skipIf: (original) => original.title.includes("sea") }
   );
   ```
  
* `opts.postClone` is a function that accepts both the original entity and its new clone, to allow customizing to the clone:

   ```ts
   // This will duplicate the author's books, and assign them to a different author
   const duplicatedBooks = await em.clone(
     author.books.get,
     { postClone: (_original, clone) => clone.author.set(author2) }
   );
   ```
